import { Array } from 'effect'
import { getTranslations } from 'next-intl/server'
import { FeatureSection } from './FeatureSection'

const screenshots = [
  'my-plants-list.png',
  'care-schedule.png',
  'log-care-modal.png',
  'plant-identified-ligustrum.png',
  'ai-chat-dry-leaves-diagnosis.png',
  'achievements.png',
  'public-profile-lily.png',
  'new-room-modal.png',
]

export async function Features() {
  const t = await getTranslations('Features')

  const features = Array.map(screenshots, (screenshot, i) => ({
    screenshot,
    catchline: t(`item${i}Catchline`),
    description: t(`item${i}Description`),
  }))

  return (
    <section id="features" className="py-8 bg-background">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-lily-text mb-4">
            {t('heading')}
          </h2>
          <p className="text-lg text-muted max-w-xl mx-auto">
            {t('subheading')}
          </p>
        </div>
        {Array.map(features, (feature, index) => (
          <FeatureSection key={feature.screenshot} {...feature} index={index} />
        ))}
      </div>
    </section>
  )
}
