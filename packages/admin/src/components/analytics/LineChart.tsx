import { Array, pipe } from 'effect'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART_COLORS, type TimeSeriesSeries, toChartData } from './chart-utils'

interface LineChartProps {
  series: ReadonlyArray<TimeSeriesSeries>
  height?: number
  colors?: ReadonlyArray<string>
}

export const LineChart = ({
  series,
  height = 240,
  colors = CHART_COLORS,
}: LineChartProps) => {
  const data = toChartData(series)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart
        data={data as Array<Record<string, string | number>>}
        margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {pipe(
          series,
          Array.map((s, idx) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={colors[idx % colors.length]}
              strokeWidth={2}
              dot={false}
            />
          ))
        )}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
