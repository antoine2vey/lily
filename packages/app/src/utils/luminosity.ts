import { Array, Option, pipe } from 'effect'

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
        Option.flatMap(Array.head)
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
