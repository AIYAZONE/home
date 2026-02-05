
import { cn } from '@/lib/utils';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">家庭仪表板</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Placeholder Stats Cards */}
        {[
          { title: '总资产', value: '¥1,234,567', trend: '+12%' },
          { title: '本月支出', value: '¥23,456', trend: '-5%' },
          { title: '家庭健康分', value: '85', trend: '+2' },
          { title: '待办事项', value: '3', trend: '紧急' },
        ].map((stat, index) => (
          <div key={index} className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500">{stat.title}</h3>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-semibold text-gray-900">{stat.value}</span>
              <span className={cn(
                "text-sm font-medium",
                stat.trend.startsWith('+') ? "text-green-600" : 
                stat.trend.startsWith('-') ? "text-red-600" : "text-yellow-600"
              )}>
                {stat.trend}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="p-8 bg-white rounded-xl shadow-sm border border-gray-100 text-center text-gray-500">
        图表区域 - 待开发
      </div>
    </div>
  );
}
