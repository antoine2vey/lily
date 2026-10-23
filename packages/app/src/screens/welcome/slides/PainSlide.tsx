import { SlideLayout, type SlideProps } from '../components/SlideLayout'
import { SlideMascot } from '../components/SlideMascot'

export function PainSlide({ title, subtitle, isNear }: SlideProps) {
  return (
    <SlideLayout title={title} subtitle={subtitle}>
      <SlideMascot animation="lookAround" mounted={isNear} />
    </SlideLayout>
  )
}
