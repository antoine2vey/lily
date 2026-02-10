import { type LuminosityLevel, luxToLuminosityLevel } from '@lily/shared'
import { Option, pipe } from 'effect'

interface ExifData {
  BrightnessValue?: number
  FNumber?: number
  ExposureTime?: number
  ISOSpeedRatings?: number[]
}

const luxFromBrightness = (exif: ExifData): Option.Option<number> =>
  pipe(
    Option.fromNullable(exif.BrightnessValue),
    Option.map((bv) => 80 * 2 ** bv)
  )

const luxFromExposure = (exif: ExifData): Option.Option<number> =>
  pipe(
    Option.all({
      fNumber: Option.fromNullable(exif.FNumber),
      exposureTime: Option.fromNullable(exif.ExposureTime),
      iso: pipe(
        Option.fromNullable(exif.ISOSpeedRatings),
        Option.flatMap((arr) =>
          arr.length > 0 ? Option.fromNullable(arr[0]) : Option.none()
        )
      ),
    }),
    Option.filter(({ exposureTime, iso }) => exposureTime > 0 && iso > 0),
    Option.map(
      ({ fNumber, exposureTime, iso }) =>
        (250 * fNumber * fNumber) / (exposureTime * iso)
    )
  )

export const calculateLuxFromExif = (exif: ExifData): Option.Option<number> =>
  Option.orElse(luxFromBrightness(exif), () => luxFromExposure(exif))

export const detectLuminosityFromExif = (
  exif: ExifData
): Option.Option<LuminosityLevel> =>
  Option.map(calculateLuxFromExif(exif), luxToLuminosityLevel)
