# Affilitics Analytics Dashboard

A comprehensive analytics dashboard for affiliate marketing with real-time features, responsive design, and advanced data visualization.

## Features

### 📊 Dashboard Components
- **Overview Statistics**: Key metrics with trend indicators
- **Revenue Charts**: Interactive time-series charts with multiple metrics
- **Platform Performance**: Pie charts showing revenue breakdown by platform
- **Recent Orders**: Table view of latest affiliate orders
- **Import Status**: Monitor data import jobs and their progress
- **Real-time Metrics**: Live performance indicators with auto-refresh
- **Mobile Dashboard**: Optimized mobile view with touch-friendly interface

### 🎨 Design & UX
- **Responsive Design**: Optimized for mobile, tablet, and desktop
- **Loading States**: Skeleton loaders for better perceived performance
- **Error Handling**: Graceful error states with retry functionality
- **Interactive Charts**: Hover tooltips, clickable legends, export capabilities
- **Real-time Updates**: Live metrics with visual indicators

### 🔧 Technical Features
- **TypeScript**: Full type safety throughout the application
- **Next.js App Router**: Modern server-side rendering
- **Prisma Database**: Type-safe database access
- **Custom Hooks**: Reusable analytics data fetching logic
- **Caching**: Intelligent data caching for performance
- **API Endpoints**: RESTful APIs for all analytics data

## File Structure

```
src/
├── app/
│   ├── dashboard/page.tsx              # Main dashboard page
│   └── api/analytics/                  # API endpoints
│       ├── overview/route.ts           # Dashboard overview metrics
│       ├── revenue/route.ts            # Revenue trends data
│       ├── platforms/route.ts          # Platform performance data
│       └── recent/route.ts             # Recent orders & import jobs
├── components/
│   ├── analytics/                      # Analytics components
│   │   ├── index.ts                    # Component exports
│   │   ├── dashboard-overview.tsx      # Overview statistics cards
│   │   ├── revenue-chart.tsx           # Interactive revenue charts
│   │   ├── platform-performance.tsx    # Platform comparison charts
│   │   ├── recent-orders.tsx           # Recent orders table
│   │   ├── import-status.tsx           # Import job monitoring
│   │   ├── quick-actions.tsx           # Quick action buttons
│   │   ├── real-time-metrics.tsx       # Live metrics component
│   │   ├── mobile-dashboard.tsx        # Mobile-optimized view
│   │   ├── responsive-grid.tsx         # Responsive utilities
│   │   ├── metric-card.tsx             # Reusable metric card
│   │   └── chart-container.tsx         # Chart wrapper component
│   ├── ui/                             # Base UI components
│   │   ├── card.tsx                    # Card component
│   │   ├── button.tsx                  # Button component
│   │   ├── badge.tsx                   # Badge component
│   │   ├── alert.tsx                   # Alert component
│   │   ├── table.tsx                   # Table components
│   │   └── dropdown-menu.tsx           # Dropdown menu component
│   └── layout/
│       ├── dashboard-layout.tsx        # Main dashboard layout
│       ├── header.tsx                  # Navigation header
│       └── sidebar.tsx                 # Sidebar navigation
└── lib/
    └── hooks/
        └── use-analytics.ts            # Analytics data hooks
```

## Usage

### 1. Basic Dashboard Implementation

```tsx
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { DashboardOverview, RevenueChart, PlatformPerformance } from "@/components/analytics"

export default function Dashboard() {
  const user = { id: "1", name: "John Doe", email: "john@example.com" }
  const workspace = { id: "workspace-1", name: "My Workspace", plan: "Pro", role: "Owner" }

  return (
    <DashboardLayout user={user} workspace={workspace}>
      <div className="space-y-6">
        <DashboardOverview workspaceId={workspace.id} />
        <div className="grid gap-6 lg:grid-cols-2">
          <RevenueChart workspaceId={workspace.id} timeRange="30d" />
          <PlatformPerformance workspaceId={workspace.id} />
        </div>
      </div>
    </DashboardLayout>
  )
}
```

### 2. Using Analytics Hooks

```tsx
import { useOverviewAnalytics, useRevenueAnalytics } from "@/lib/hooks/use-analytics"

function MyAnalyticsComponent({ workspaceId }: { workspaceId: string }) {
  const { data, loading, error, refetch } = useOverviewAnalytics({
    workspaceId,
    timeRange: "30d",
    refreshInterval: 5 * 60 * 1000 // Refresh every 5 minutes
  })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      <h2>Total Revenue: ${data.totalRevenue.value}</h2>
      <p>Change: {data.totalRevenue.change.value}% vs last period</p>
    </div>
  )
}
```

### 3. Real-time Metrics

```tsx
import { RealTimeMetrics } from "@/components/analytics/real-time-metrics"

function LiveDashboard({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="space-y-6">
      <RealTimeMetrics workspaceId={workspaceId} />
      {/* Other dashboard components */}
    </div>
  )
}
```

### 4. Mobile-Optimized Dashboard

```tsx
import { MobileDashboard } from "@/components/analytics/mobile-dashboard"
import { useResponsive } from "@/components/analytics/responsive-grid"

function ResponsiveDashboard({ workspaceId }: { workspaceId: string }) {
  const { isMobile } = useResponsive()
  
  const handleViewDetails = (metric: string) => {
    // Navigate to detailed view
    console.log(`View details for: ${metric}`)
  }

  if (isMobile) {
    return (
      <MobileDashboard 
        workspaceId={workspaceId} 
        onViewDetails={handleViewDetails}
      />
    )
  }

  return (
    // Desktop dashboard
    <div>...</div>
  )
}
```

## API Endpoints

### GET /api/analytics/overview
Returns dashboard overview statistics.

**Query Parameters:**
- `workspaceId` (required): Workspace identifier
- `timeRange` (optional): Time period (7d, 30d, 90d, 1y)

**Response:**
```json
{
  "totalRevenue": {
    "value": 45230,
    "change": { "value": 12.5, "type": "increase", "period": "last period" }
  },
  "totalOrders": {
    "value": 1234,
    "change": { "value": 8.2, "type": "increase", "period": "last period" }
  },
  "totalCommission": {
    "value": 3456,
    "change": { "value": -2.1, "type": "decrease", "period": "last period" }
  },
  "conversionRate": {
    "value": 3.24,
    "change": { "value": 0.5, "type": "increase", "period": "last period" }
  }
}
```

### GET /api/analytics/revenue
Returns daily revenue data for charts.

**Query Parameters:**
- `workspaceId` (required): Workspace identifier
- `timeRange` (optional): Time period (7d, 30d, 90d, 1y)

**Response:**
```json
[
  {
    "date": "Dec 01",
    "fullDate": "2023-12-01T00:00:00.000Z",
    "revenue": 1250.50,
    "orders": 28,
    "commission": 100.04
  }
]
```

### GET /api/analytics/platforms
Returns platform performance data.

**Query Parameters:**
- `workspaceId` (required): Workspace identifier
- `timeRange` (optional): Time period (7d, 30d, 90d, 1y)

**Response:**
```json
[
  {
    "name": "Shopee",
    "value": 45.2,
    "revenue": 12450,
    "commission": 996,
    "orders": 234,
    "change": 12.3,
    "color": "#ee4d2d"
  }
]
```

### GET /api/analytics/recent
Returns recent orders and activity.

**Query Parameters:**
- `workspaceId` (required): Workspace identifier
- `limit` (optional): Number of records to return (default: 10)

## Dependencies

### Required Packages
```json
{
  "recharts": "^3.2.1",
  "date-fns": "^4.1.0",
  "@radix-ui/react-dropdown-menu": "^2.1.16",
  "@radix-ui/react-slot": "^1.2.3",
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.1.1",
  "tailwind-merge": "^2.5.2",
  "lucide-react": "^0.439.0"
}
```

### Database Schema
The dashboard expects these Prisma models:
- `Workspace`: Workspace information
- `Member`: Workspace members
- `ImportJob`: Data import jobs
- `ImportError`: Import error logs
- `AffiliateOrder`: Affiliate order data

## Performance Optimizations

1. **Data Caching**: Automatic caching with configurable TTL
2. **Lazy Loading**: Components load on demand
3. **Skeleton Loading**: Immediate visual feedback
4. **Responsive Images**: Optimized for different screen sizes
5. **Bundle Splitting**: Code splitting for better loading times

## Security Features

1. **Workspace Isolation**: All queries filtered by workspace
2. **Input Validation**: Zod schema validation
3. **Error Boundaries**: Graceful error handling
4. **Rate Limiting**: API endpoint protection
5. **SQL Injection Prevention**: Prisma query builder

## Browser Support

- **Modern Browsers**: Chrome 88+, Firefox 85+, Safari 14+, Edge 88+
- **Mobile**: iOS Safari 14+, Chrome Mobile 88+
- **Responsive**: Supports screen sizes from 320px to 2560px+

## Development

To extend the dashboard:

1. Add new components to `/components/analytics/`
2. Create corresponding API endpoints in `/app/api/analytics/`
3. Update the hooks in `/lib/hooks/use-analytics.ts`
4. Export new components in `/components/analytics/index.ts`

## License

This analytics dashboard is part of the Affilitics platform.