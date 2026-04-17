import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface HistogramProps {
  data: ReadonlyArray<{ readonly label: string; readonly count: number }>
  height?: number
  color?: string
}

export const Histogram = ({
  data,
  height = 220,
  color = '#2563eb',
}: HistogramProps) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart
      data={data as Array<{ label: string; count: number }>}
      margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
    >
      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
      <Tooltip />
      <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
)
