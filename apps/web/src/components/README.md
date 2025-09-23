# Affilitics UI Components

This directory contains all the UI components and layout components for the Affilitics application.

## Structure

```
components/
├── ui/                 # Basic UI components
│   ├── button.tsx      # Button component with variants
│   ├── input.tsx       # Input component with validation
│   ├── card.tsx        # Card components for data display
│   ├── badge.tsx       # Badge/chip components
│   ├── loading.tsx     # Loading spinner variants
│   ├── alert.tsx       # Alert/notification components
│   └── index.ts        # UI components exports
├── layout/             # Layout components
│   ├── header.tsx      # App header with navigation
│   ├── sidebar.tsx     # Sidebar navigation
│   ├── dashboard-layout.tsx  # Main dashboard layout
│   ├── page-wrapper.tsx      # Page structure components
│   ├── container.tsx         # Container components
│   └── index.ts        # Layout components exports
├── examples/           # Example implementations
│   └── dashboard-example.tsx
└── README.md
```

## UI Components

### Button
Versatile button component with multiple variants:
- `default` - Primary button style
- `destructive` - For dangerous actions
- `outline` - Outlined button
- `secondary` - Secondary actions
- `ghost` - Minimal button
- `link` - Link-styled button
- `brand` - Brand colored button
- `success`, `warning`, `info` - Semantic variants

**Usage:**
```tsx
import { Button } from '@/components/ui'

<Button variant="brand" size="lg" loading>
  Create Campaign
</Button>
```

### Input
Input component with validation states and icons:
- Support for validation states (error, success, warning)
- Start and end icon support
- Helper text and error messages
- Label support with required indicators

**Usage:**
```tsx
import { Input } from '@/components/ui'
import { Search } from 'lucide-react'

<Input
  label="Search"
  placeholder="Search campaigns..."
  startIcon={<Search className="h-4 w-4" />}
  error="This field is required"
/>
```

### Card
Flexible card component for displaying grouped content:
- `Card` - Main container
- `CardHeader` - Header section
- `CardTitle` - Title component
- `CardDescription` - Description text
- `CardContent` - Main content area
- `CardFooter` - Footer section

**Usage:**
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui'

<Card>
  <CardHeader>
    <CardTitle>Campaign Performance</CardTitle>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
</Card>
```

### Badge
Badge component for status indicators:
- Multiple color variants
- Dot indicator support
- Size variants

**Usage:**
```tsx
import { Badge } from '@/components/ui'

<Badge variant="success" dot>
  Active
</Badge>
```

### Loading
Various loading state components:
- `Loading` - Basic spinner
- `LoadingScreen` - Full screen loading
- `LoadingButton` - Button-sized spinner
- `LoadingCard` - Card loading state

**Usage:**
```tsx
import { Loading, LoadingScreen } from '@/components/ui'

<Loading size="lg" text="Processing..." />
<LoadingScreen text="Loading dashboard..." />
```

### Alert
Alert components for notifications:
- `Alert` - Base alert component
- `AlertError`, `AlertSuccess`, `AlertWarning`, `AlertInfo` - Semantic variants
- Dismissible alerts support

**Usage:**
```tsx
import { AlertSuccess, Alert, AlertTitle, AlertDescription } from '@/components/ui'

<AlertSuccess 
  title="Success!" 
  description="Your campaign was created successfully."
  dismissible
/>

// Or custom alert
<Alert variant="info" dismissible>
  <AlertTitle>Info</AlertTitle>
  <AlertDescription>
    This is a custom alert message.
  </AlertDescription>
</Alert>
```

## Layout Components

### DashboardLayout
Main layout wrapper for dashboard pages:
- Responsive sidebar navigation
- Header with user/workspace info
- Mobile-friendly design

**Usage:**
```tsx
import { DashboardLayout } from '@/components/layout'

const user = {
  id: "1",
  email: "user@example.com",
  name: "John Doe"
}

const workspace = {
  id: "1",
  name: "My Workspace",
  plan: "Pro",
  role: "Admin"
}

<DashboardLayout user={user} workspace={workspace}>
  <YourPageContent />
</DashboardLayout>
```

### Page Components
Structure components for consistent page layouts:
- `PageWrapper` - Main page container
- `PageHeader` - Page title and actions
- `PageContent` - Main content area

**Usage:**
```tsx
import { PageWrapper, PageHeader, PageContent, Button } from '@/components/layout'

<PageWrapper>
  <PageHeader
    title="Campaigns"
    description="Manage your affiliate campaigns"
  >
    <Button variant="brand">Create Campaign</Button>
  </PageHeader>
  <PageContent>
    Your content here
  </PageContent>
</PageWrapper>
```

### Container Components
Responsive container components:
- `Container` - Basic container with responsive padding
- `GridContainer` - CSS Grid-based layout
- `FlexContainer` - Flexbox-based layout

**Usage:**
```tsx
import { Container, GridContainer, FlexContainer } from '@/components/layout'

<GridContainer cols={4} gap="lg">
  {metrics.map(metric => (
    <Card key={metric.id}>...</Card>
  ))}
</GridContainer>

<FlexContainer direction="row" justify="between" align="center">
  <h2>Title</h2>
  <Button>Action</Button>
</FlexContainer>
```

## Styling System

### CSS Variables
The components use CSS variables for theming:
- Color tokens: `--background`, `--foreground`, `--primary`, etc.
- Brand colors: `--brand-blue`, `--brand-blue-light`, `--brand-blue-dark`
- Semantic colors: `--success`, `--warning`, `--info`, `--destructive`

### Utility Functions
Located in `/src/lib/utils.ts`:
- `cn()` - Class name merger with Tailwind conflict resolution
- `formatNumber()`, `formatCurrency()`, `formatPercentage()` - Number formatting
- `truncateText()`, `debounce()`, `isEmpty()` - Common utilities

## Design Principles

1. **Consistency** - All components follow the same design patterns
2. **Accessibility** - ARIA labels, keyboard navigation, focus management
3. **Responsive** - Mobile-first design with responsive breakpoints
4. **Performance** - Optimized for fast loading and smooth interactions
5. **Customization** - Easy to theme and extend with variants

## Development Guidelines

1. **Use TypeScript** - All components are fully typed
2. **Follow naming conventions** - Use descriptive names and consistent patterns
3. **Add proper props** - Include all necessary props with good defaults
4. **Handle edge cases** - Consider loading states, errors, and empty states
5. **Test thoroughly** - Test all variants and states

## Examples

See `/src/components/examples/dashboard-example.tsx` for a comprehensive example showing how to use all the components together.

## Contributing

When adding new components:
1. Follow the existing patterns and file structure
2. Add proper TypeScript types
3. Include all necessary variants and states
4. Update the index files for exports
5. Add examples and documentation