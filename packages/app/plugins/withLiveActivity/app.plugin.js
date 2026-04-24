/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Expo config plugin: adds the LilyWidgetsExtension widget target to the
 * Xcode project on `expo prebuild` and injects NSSupportsLiveActivities into
 * the main app's Info.plist.
 *
 * Canonical widget sources live in `packages/app/templates/LilyWidgetsExtension/`.
 * This plugin copies them into `ios/LilyWidgetsExtension/` on every prebuild,
 * so template edits always win. Do not hand-edit the copied files.
 */

const fs = require('node:fs')
const path = require('node:path')
const {
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins')

const WIDGET_TARGET_NAME = 'LilyWidgetsExtension'
const WIDGET_DEPLOYMENT_TARGET = '16.2'

const SWIFT_SOURCES = [
  'LilyWidgetsBundle.swift',
  'CareTasksAttributes.swift',
  'CareTasksLiveActivity.swift',
]
// Bundled into the widget extension's Resources build phase. The asset
// catalog ships the app icon used by the live activity lock-screen view —
// widget extensions can't reach into the host app's bundle at runtime.
const RESOURCES = ['Assets.xcassets']
const FRAMEWORKS = [
  'SwiftUI.framework',
  'WidgetKit.framework',
  'ActivityKit.framework',
]

/** Recursively copy `src` → `dst`, mirroring directory structure. */
const copyRecursive = (src, dst) => {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry))
    }
  } else {
    fs.copyFileSync(src, dst)
  }
}

/** @param {string} projectRoot */
const syncWidgetSources = (projectRoot) => {
  const src = path.join(projectRoot, 'templates', WIDGET_TARGET_NAME)
  const dst = path.join(projectRoot, 'ios', WIDGET_TARGET_NAME)
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    copyRecursive(path.join(src, entry), path.join(dst, entry))
  }
}

// xcode-style 24-char uppercase hex UUIDs (12 random bytes).
const generatePbxUuid = () => {
  let out = ''
  for (let i = 0; i < 24; i++) {
    out += Math.floor(Math.random() * 16)
      .toString(16)
      .toUpperCase()
  }
  return out
}

// Locate the PBXResourcesBuildPhase belonging to a given native target so we
// can append PBXBuildFile entries to it directly.
const findPbxResourcesBuildPhaseForTarget = (project, targetUuid) => {
  const targets = project.pbxNativeTargetSection() || {}
  const t = targets[targetUuid]
  if (!t || !Array.isArray(t.buildPhases)) return null
  for (const phaseRef of t.buildPhases) {
    if (
      phaseRef &&
      typeof phaseRef.comment === 'string' &&
      phaseRef.comment === 'Resources'
    ) {
      return phaseRef.value
    }
  }
  return null
}

// Manually wire an `.xcassets` folder reference into:
//   - the PBXFileReference section (with a fully-qualified path)
//   - the widget's PBXGroup children list (so it shows in the navigator)
//   - the widget's PBXResourcesBuildPhase files list (so it gets compiled
//     by `actool` and bundled into the .appex)
// Bypasses `project.addResourceFile`, which crashes on projects containing
// any path-less file refs.
const addAssetCatalogResource = ({
  project,
  groupUuid,
  resourcesPhaseUuid,
  resourceName,
}) => {
  if (!resourcesPhaseUuid) return

  const fileRefUuid = generatePbxUuid()
  const buildFileUuid = generatePbxUuid()

  // PBXFileReference — folder reference for the asset catalog.
  // The path is bare (no widget-dir prefix) because we attach this ref to
  // the widget's PBXGroup, whose own `path = LilyWidgetsExtension` already
  // anchors the lookup. Adding the prefix would make Xcode resolve to
  // `LilyWidgetsExtension/LilyWidgetsExtension/Assets.xcassets` and silently
  // skip actool with a "Failed to read file attributes" warning.
  const fileRefSection = project.pbxFileReferenceSection()
  fileRefSection[fileRefUuid] = {
    isa: 'PBXFileReference',
    lastKnownFileType: 'folder.assetcatalog',
    name: resourceName,
    path: resourceName,
    sourceTree: '"<group>"',
  }
  fileRefSection[`${fileRefUuid}_comment`] = resourceName

  // PBXBuildFile — the in-Resources entry for the widget target.
  const buildFileSection = project.pbxBuildFileSection()
  buildFileSection[buildFileUuid] = {
    isa: 'PBXBuildFile',
    fileRef: fileRefUuid,
    fileRef_comment: resourceName,
  }
  buildFileSection[`${buildFileUuid}_comment`] = `${resourceName} in Resources`

  // Attach the file ref to the widget group.
  const group = project.getPBXGroupByKey(groupUuid)
  if (group && Array.isArray(group.children)) {
    group.children.push({ value: fileRefUuid, comment: resourceName })
  }

  // Append to the widget's Resources phase. Access the section directly
  // since the xcode lib's accessor method isn't available in all versions.
  const phaseObj =
    project.hash.project.objects.PBXResourcesBuildPhase[resourcesPhaseUuid]
  if (phaseObj && Array.isArray(phaseObj.files)) {
    phaseObj.files.push({
      value: buildFileUuid,
      comment: `${resourceName} in Resources`,
    })
  }
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withLiveActivityInfoPlist = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.NSSupportsLiveActivities = true
    cfg.modResults.NSSupportsLiveActivitiesFrequentUpdates = true
    return cfg
  })

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withWidgetExtensionTarget = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    syncWidgetSources(cfg.modRequest.projectRoot)

    // Idempotency: skip if the target is already there.
    const nativeTargets = project.pbxNativeTargetSection() || {}
    const exists = Object.values(nativeTargets).some(
      (t) => typeof t === 'object' && t && t.name === WIDGET_TARGET_NAME
    )
    if (exists) return cfg

    const mainBundleId = cfg.ios?.bundleIdentifier || 'com.lilyapp.app'
    const widgetBundleId = `${mainBundleId}.LilyWidgets`

    // 1. Create the PBXNativeTarget. This sets up productReference and
    //    a blank buildConfigurationList, but *does not* create build phases.
    const target = project.addTarget(
      WIDGET_TARGET_NAME,
      'app_extension',
      WIDGET_TARGET_NAME,
      widgetBundleId
    )

    // 2. Create the three build phases this target needs. Order matters:
    //    Sources → Frameworks → Resources. Without these the target produces
    //    an .appex with no executable (device install fails at preflight).
    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid)
    project.addBuildPhase(
      FRAMEWORKS,
      'PBXFrameworksBuildPhase',
      'Frameworks',
      target.uuid
    )
    project.addBuildPhase(
      RESOURCES,
      'PBXResourcesBuildPhase',
      'Resources',
      target.uuid
    )

    // 3. Create an empty PBXGroup whose *path* is the widget dir. Files
    //    added through addSourceFile below will attach to this group and
    //    inherit the group's path — so the file refs resolve to
    //    `LilyWidgetsExtension/<file>` relative to the project root.
    //    NB: we intentionally do NOT pre-populate the group with the swift
    //    filenames. addPbxGroup would create bare PBXFileReferences with no
    //    link to any build phase, and addSourceFile would then create a
    //    second ref — ending up with doubled/wrong paths.
    const group = project.addPbxGroup(
      ['Info.plist', `${WIDGET_TARGET_NAME}.entitlements`],
      WIDGET_TARGET_NAME,
      WIDGET_TARGET_NAME
    )

    // 4. Attach that group to the project root so Xcode shows it in the
    //    navigator. `mainGroup` is the project-level container.
    const mainGroupKey =
      project.findPBXGroupKey({ name: 'CustomTemplate' }) ||
      project.getFirstProject().firstProject.mainGroup
    project.addToPbxGroup(group.uuid, mainGroupKey)

    // 5. Register each Swift file as a *source* of the widget target. This
    //    creates the PBXFileReference AND the PBXBuildFile entry that links
    //    the source to the Sources build phase created above. The path is
    //    just the filename because the enclosing group already has path =
    //    WIDGET_TARGET_NAME.
    for (const source of SWIFT_SOURCES) {
      project.addSourceFile(source, { target: target.uuid }, group.uuid)
    }

    // 5b. Register each Resource (e.g. `Assets.xcassets`) so the asset
    //     catalog is compiled and bundled into the .appex. Without this
    //     `Image("AppIcon")` returns nil at runtime even though the file
    //     exists on disk.
    //
    //     We bypass `project.addResourceFile` because its path-correction
    //     pass walks every existing file ref in the project and crashes on
    //     any ref whose `path` is null (`correctForPath` reads `.path`
    //     unguarded). Instead, manually create the PBXFileReference with a
    //     fully-qualified path, attach it to the widget group, and emit the
    //     PBXBuildFile entry pointing at the widget's Resources phase.
    const resourcesPhase = findPbxResourcesBuildPhaseForTarget(
      project,
      target.uuid
    )
    for (const resource of RESOURCES) {
      addAssetCatalogResource({
        project,
        groupUuid: group.uuid,
        resourcesPhaseUuid: resourcesPhase,
        resourceName: resource,
      })
    }

    // 6. Apply target-specific build settings to both Debug and Release.
    const configurations = project.pbxXCBuildConfigurationSection()
    for (const key in configurations) {
      const c = configurations[key]
      if (
        c?.buildSettings &&
        c.buildSettings.PRODUCT_NAME === `"${WIDGET_TARGET_NAME}"`
      ) {
        c.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = WIDGET_DEPLOYMENT_TARGET
        c.buildSettings.CODE_SIGN_ENTITLEMENTS = `${WIDGET_TARGET_NAME}/${WIDGET_TARGET_NAME}.entitlements`
        c.buildSettings.SWIFT_VERSION = '5.9'
        c.buildSettings.INFOPLIST_FILE = `${WIDGET_TARGET_NAME}/Info.plist`
        c.buildSettings.SKIP_INSTALL = 'YES'
        c.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"'
        // Needed for Swift app extensions to link against the Swift runtime.
        c.buildSettings.LD_RUNPATH_SEARCH_PATHS =
          '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"'
        c.buildSettings.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = 'YES'
        // Do NOT set DEVELOPMENT_TEAM / CODE_SIGN_STYLE explicitly on the
        // widget — pbxproj requires quoting for `$(DEVELOPMENT_TEAM)`-style
        // values (Nanaimo chokes on the unquoted `(`), and EAS's build-time
        // `xcodebuild -xcconfig` / env injection fills these in at the
        // project level. The widget inherits from there.
        // Widget extensions inherit assetcatalog settings from the project
        // level, including the host app's `ASSETCATALOG_COMPILER_APPICON_NAME`
        // (= "lily"). Our widget catalog ships an `AppIcon.imageset` for
        // `Image("AppIcon")`, NOT an app-icon set named "lily" — actool
        // would error: "None of the input catalogs contained a matching
        // app icon set named lily". Widgets don't need their own app icon
        // (the system uses the host app's), so clear the override.
        c.buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME = '""'
      }
    }

    return cfg
  })

// Xcode 14+ signs resource bundles by default, which requires a DEVELOPMENT_TEAM
// on each bundle target. EAS Build only injects the team on the main app target,
// so Pod resource bundles fail with:
//   "Signing for 'X' requires a development team. Select a development team..."
// Disabling code signing on bundles is the standard workaround — they're
// re-signed as part of the app bundle at archive time.
const PODFILE_MARKER_START = '# BEGIN: LilyWidgetsExtension bundle signing fix'
const PODFILE_MARKER_END = '# END: LilyWidgetsExtension bundle signing fix'

const PODFILE_SNIPPET = `    ${PODFILE_MARKER_START}
    bundle_fix_count = 0
    projects_to_patch = [installer.pods_project]
    if installer.respond_to?(:generated_projects)
      projects_to_patch += installer.generated_projects
    end
    projects_to_patch.compact.uniq.each do |project|
      project.targets.each do |target|
        is_bundle = target.respond_to?(:product_type) &&
                    target.product_type == 'com.apple.product-type.bundle'
        name_bundle = target.name.to_s.end_with?('.bundle')
        if is_bundle || name_bundle
          target.build_configurations.each do |config|
            config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
            config.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
            config.build_settings['CODE_SIGN_IDENTITY'] = ''
            config.build_settings['EXPANDED_CODE_SIGN_IDENTITY'] = ''
          end
          bundle_fix_count += 1
        end
      end
    end
    Pod::UI.puts "[LilyWidgetsExtension] disabled code signing on #{bundle_fix_count} resource bundle target(s)"
    ${PODFILE_MARKER_END}
`

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withPodfileBundleSigningFix = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        'Podfile'
      )
      if (!fs.existsSync(podfilePath)) return cfg

      let contents = fs.readFileSync(podfilePath, 'utf8')
      if (contents.includes(PODFILE_MARKER_START)) {
        console.log(
          '[withLiveActivity] Podfile already patched, skipping injection'
        )
        return cfg
      }

      // Tolerate spacing variants and arbitrary block-parameter names.
      const postInstallOpen = contents.match(
        /post_install\s+do\s*\|[^|]+\|\s*\n/
      )
      if (postInstallOpen) {
        contents = contents.replace(
          postInstallOpen[0],
          `${postInstallOpen[0]}${PODFILE_SNIPPET}`
        )
        console.log(
          '[withLiveActivity] injected bundle-signing fix into existing post_install block'
        )
      } else {
        contents += `\npost_install do |installer|\n${PODFILE_SNIPPET}end\n`
        console.log(
          '[withLiveActivity] no existing post_install block — appended a new one'
        )
      }

      fs.writeFileSync(podfilePath, contents)
      return cfg
    },
  ])

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withLiveActivity = (config) =>
  withPodfileBundleSigningFix(
    withWidgetExtensionTarget(withLiveActivityInfoPlist(config))
  )

module.exports = withLiveActivity
