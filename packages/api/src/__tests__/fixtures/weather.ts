import type { WeatherData, WeatherForecast } from '@lily/shared'

// Standard moderate weather day
export const mockWeatherDataModerate: WeatherData = {
  date: '2026-02-10',
  temperatureMin: 10,
  temperatureMax: 22,
  temperatureMean: 16,
  humidity: 65,
  windSpeed: 3,
  precipitation: 0,
  solarRadiation: 15,
  et0: 3.5,
  cloudCover: 40,
  soilTemperature: 14,
}

// Hot day (above TEMP_HIGH_C = 29.4°C)
export const mockWeatherDataHot: WeatherData = {
  date: '2026-02-09',
  temperatureMin: 22,
  temperatureMax: 35,
  temperatureMean: 31,
  humidity: 45,
  windSpeed: 3,
  precipitation: 0,
  solarRadiation: 22,
  et0: 6.0,
  cloudCover: 10,
  soilTemperature: 25,
}

// Cold day (below TEMP_LOW_C = 15.6°C)
export const mockWeatherDataCold: WeatherData = {
  date: '2026-02-08',
  temperatureMin: 2,
  temperatureMax: 10,
  temperatureMean: 6,
  humidity: 75,
  windSpeed: 2,
  precipitation: 1,
  solarRadiation: 5,
  et0: 1.0,
  cloudCover: 80,
  soilTemperature: 5,
}

// Rainy day (>6mm precipitation)
export const mockWeatherDataRainy: WeatherData = {
  date: '2026-02-07',
  temperatureMin: 12,
  temperatureMax: 18,
  temperatureMean: 15,
  humidity: 90,
  windSpeed: 4,
  precipitation: 12,
  solarRadiation: 6,
  et0: 1.5,
  cloudCover: 95,
  soilTemperature: 12,
}

// High humidity day (>80%)
export const mockWeatherDataHumid: WeatherData = {
  date: '2026-02-06',
  temperatureMin: 18,
  temperatureMax: 25,
  temperatureMean: 22,
  humidity: 88,
  windSpeed: 1.5,
  precipitation: 0,
  solarRadiation: 12,
  et0: 2.5,
  cloudCover: 60,
  soilTemperature: 18,
}

// Low humidity day (<50%)
export const mockWeatherDataDry: WeatherData = {
  date: '2026-02-05',
  temperatureMin: 15,
  temperatureMax: 28,
  temperatureMean: 22,
  humidity: 35,
  windSpeed: 4,
  precipitation: 0,
  solarRadiation: 20,
  et0: 5.0,
  cloudCover: 15,
  soilTemperature: 18,
}

// Windy day (>5 m/s)
export const mockWeatherDataWindy: WeatherData = {
  date: '2026-02-04',
  temperatureMin: 12,
  temperatureMax: 20,
  temperatureMean: 16,
  humidity: 55,
  windSpeed: 8,
  precipitation: 0,
  solarRadiation: 14,
  et0: 4.0,
  cloudCover: 30,
  soilTemperature: 13,
}

// Calm day (<2 m/s wind)
export const mockWeatherDataCalm: WeatherData = {
  date: '2026-02-03',
  temperatureMin: 14,
  temperatureMax: 22,
  temperatureMean: 18,
  humidity: 60,
  windSpeed: 1,
  precipitation: 0,
  solarRadiation: 16,
  et0: 2.8,
  cloudCover: 35,
  soilTemperature: 15,
}

// Extreme heat for fertilization skip (>30°C max)
export const mockWeatherDataExtremeHeat: WeatherData = {
  date: '2026-02-02',
  temperatureMin: 25,
  temperatureMax: 38,
  temperatureMean: 32,
  humidity: 30,
  windSpeed: 3,
  precipitation: 0,
  solarRadiation: 24,
  et0: 7.0,
  cloudCover: 5,
  soilTemperature: 28,
}

// Extreme cold for fertilization skip (<5°C min)
export const mockWeatherDataExtremeCold: WeatherData = {
  date: '2026-02-01',
  temperatureMin: 2,
  temperatureMax: 8,
  temperatureMean: 5,
  humidity: 80,
  windSpeed: 5,
  precipitation: 3,
  solarRadiation: 3,
  et0: 0.5,
  cloudCover: 90,
  soilTemperature: 3,
}

// 3+ consecutive hot days for heat wave detection
export const mockHeatWaveHistory: ReadonlyArray<WeatherData> = [
  { ...mockWeatherDataHot, date: '2026-02-10' },
  { ...mockWeatherDataHot, date: '2026-02-09' },
  { ...mockWeatherDataHot, date: '2026-02-08' },
  { ...mockWeatherDataHot, date: '2026-02-07' },
]

// Standard 7-day forecast
export const mockForecast: WeatherForecast = {
  latitude: 48.86,
  longitude: 2.35,
  daily: [
    mockWeatherDataModerate,
    { ...mockWeatherDataModerate, date: '2026-02-11' },
    { ...mockWeatherDataModerate, date: '2026-02-12' },
    { ...mockWeatherDataModerate, date: '2026-02-13' },
    { ...mockWeatherDataModerate, date: '2026-02-14' },
    { ...mockWeatherDataModerate, date: '2026-02-15' },
    { ...mockWeatherDataModerate, date: '2026-02-16' },
  ],
}

// Forecast with rain tomorrow
export const mockForecastWithRain: WeatherForecast = {
  latitude: 48.86,
  longitude: 2.35,
  daily: [
    mockWeatherDataModerate,
    { ...mockWeatherDataRainy, date: '2026-02-11' },
    { ...mockWeatherDataModerate, date: '2026-02-12' },
  ],
}
