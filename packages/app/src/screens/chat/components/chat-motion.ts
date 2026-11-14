import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  Keyframe,
} from 'react-native-reanimated'

const EASE_OUT = Easing.out(Easing.cubic)

const RISE_DISTANCE = 8
const RISE_DURATION = 240
const CHIPS_START_DELAY = 150
const CHIP_STAGGER = 40

const riseIn = (delay: number) =>
  FadeInDown.duration(RISE_DURATION)
    .delay(delay)
    .easing(EASE_OUT)
    .withInitialValues({ transform: [{ translateY: RISE_DISTANCE }] })

export const messageEntering = riseIn(0)

export const chipEntering = (index: number) =>
  riseIn(CHIPS_START_DELAY + index * CHIP_STAGGER)

export const toolCardEntering = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.97 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE_OUT },
}).duration(260)

export const typingEntering = FadeIn.duration(200)
export const typingExiting = FadeOut.duration(150)
