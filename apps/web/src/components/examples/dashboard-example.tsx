"use client"

import * as React from "react"
import { TrendingUp, Users, Link, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react"

import { 
  Button, 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
  Loading
} from "@/components/ui"
import { 
  DashboardLayout, 
  PageWrapper, 
  PageHeader, 
  PageContent,
  GridContainer,
  FlexContainer
} from "@/components/layout"

// Sample data
const mockUser = {
  id: "1",
  email: "john@example.com",
  name: "John Doe",
  avatar: undefined
}

const mockWorkspace = {
  id: "1",
  name: "Acme Corp",
  plan: "Pro",
  role: "Admin",
  usage: {
    campaigns: 12,
    maxCampaigns: 50,
    links: 145,
    maxLinks: 1000
  }
}

const metrics = [
  {
    title: "Total Clicks",
    value: "12,543",
    change: "+12.5%",
    trend: "up" as const,
    icon: TrendingUp
  },
  {
    title: "Conversions",
    value: "1,247",
    change: "+8.2%",
    trend: "up" as const,
    icon: Users
  },
  {
    title: "Active Links",
    value: "145",
    change: "-2.4%",
    trend: "down" as const,
    icon: Link
  },
  {
    title: "Revenue",
    value: "$24,563",
    change: "+15.3%",
    trend: "up" as const,
    icon: DollarSign
  }
]

const recentCampaigns = [
  {
    id: "1",
    name: "Summer Sale Campaign",
    status: "active",
    clicks: 2543,
    conversions: 156,
    revenue: "$3,245"
  },
  {
    id: "2",
    name: "Product Launch",
    status: "paused",
    clicks: 1876,
    conversions: 98,
    revenue: "$2,156"
  },
  {
    id: "3",
    name: "Holiday Promotion",
    status: "active",
    clicks: 3421,
    conversions: 234,
    revenue: "$5,432"
  }
]

export function DashboardExample() {
  const [isLoading, setIsLoading] = React.useState(true)

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000)
    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return (
      <DashboardLayout user={mockUser} workspace={mockWorkspace}>
        <div className="flex items-center justify-center h-64">
          <Loading size="lg" text="Loading dashboard..." />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout user={mockUser} workspace={mockWorkspace}>
      <PageWrapper>
        <PageHeader
          title="Dashboard"
          description="Welcome back! Here's what's happening with your affiliate campaigns."
        >
          <Button variant="brand">
            Create Campaign
          </Button>
        </PageHeader>

        <PageContent>
          {/* Alert */}
          <Alert>
            <AlertTitle>New Feature Available</AlertTitle>
            <AlertDescription>
              Try our new AI-powered campaign optimization tools to boost your conversion rates by up to 30%.
            </AlertDescription>
          </Alert>

          {/* Metrics Cards */}
          <GridContainer cols={4} gap="lg">
            {metrics.map((metric) => {
              const Icon = metric.icon
              const TrendIcon = metric.trend === "up" ? ArrowUpRight : ArrowDownRight
              
              return (
                <Card key={metric.title}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {metric.title}
                    </CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metric.value}</div>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <TrendIcon 
                        className={`mr-1 h-4 w-4 ${
                          metric.trend === "up" ? "text-success" : "text-destructive"
                        }`}
                      />
                      <span className={
                        metric.trend === "up" ? "text-success" : "text-destructive"
                      }>
                        {metric.change}
                      </span>
                      <span className="ml-1">from last month</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </GridContainer>

          {/* Recent Campaigns */}
          <Card>
            <CardHeader>
              <FlexContainer justify="between" align="center">
                <div>
                  <CardTitle>Recent Campaigns</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Your most recent campaign performance
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  View All
                </Button>
              </FlexContainer>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentCampaigns.map((campaign) => (
                  <FlexContainer key={campaign.id} justify="between" align="center">
                    <div className="space-y-1">
                      <p className="font-medium">{campaign.name}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{campaign.clicks.toLocaleString()} clicks</span>
                        <span>{campaign.conversions} conversions</span>
                        <span>{campaign.revenue} revenue</span>
                      </div>
                    </div>
                    <Badge 
                      variant={campaign.status === "active" ? "success" : "secondary"}
                    >
                      {campaign.status}
                    </Badge>
                  </FlexContainer>
                ))}
              </div>
            </CardContent>
          </Card>
        </PageContent>
      </PageWrapper>
    </DashboardLayout>
  )
}