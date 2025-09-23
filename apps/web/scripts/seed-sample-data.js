import { PrismaClient } from '@aff/db'
import { subDays, startOfDay } from 'date-fns'

const prisma = new PrismaClient()

async function createSampleData() {
  console.log('🌱 Creating sample data...')

  // Create a workspace
  const workspace = await prisma.workspace.upsert({
    where: { id: 'mock-workspace-1' },
    update: {},
    create: {
      id: 'mock-workspace-1',
      name: 'Sample Workspace',
      plan: 'pro',
    }
  })

  console.log('✅ Created workspace:', workspace.name)

  // Create sample affiliate orders for the last 30 days
  const platforms = ['Shopee', 'Lazada', 'TikTok', 'Amazon', 'Tokopedia']
  const orders = []

  for (let i = 0; i < 150; i++) {
    const platform = platforms[Math.floor(Math.random() * platforms.length)]
    const daysAgo = Math.floor(Math.random() * 30)
    const eventDate = startOfDay(subDays(new Date(), daysAgo))
    
    const amount = 25 + Math.random() * 500
    const commission = amount * (0.05 + Math.random() * 0.1) // 5-15% commission
    
    orders.push({
      workspaceId: workspace.id,
      platform,
      orderId: `${platform.toUpperCase()}-${Date.now()}-${i}`,
      subid: `customer-${i + 1}`,
      amount: Math.round(amount * 100) / 100,
      net: Math.round((amount * 0.9) * 100) / 100, // 90% of amount
      commission: Math.round(commission * 100) / 100,
      eventDate,
    })
  }

  // Insert all orders
  await prisma.affiliateOrder.createMany({
    data: orders,
    skipDuplicates: true
  })

  console.log(`✅ Created ${orders.length} sample affiliate orders`)

  // Create sample import jobs
  const importJobs = [
    {
      workspaceId: workspace.id,
      platform: 'Shopee',
      filename: 'shopee-orders-2024-09.csv',
      size: 524288, // 512KB
      status: 'completed',
      startedAt: subDays(new Date(), 2),
      finishedAt: subDays(new Date(), 2),
      createdBy: 'user-1',
      hash: 'abc123'
    },
    {
      workspaceId: workspace.id,
      platform: 'Lazada',
      filename: 'lazada-orders-2024-09.csv',
      size: 1048576, // 1MB
      status: 'processing',
      startedAt: new Date(),
      createdBy: 'user-1',
      hash: 'def456'
    },
    {
      workspaceId: workspace.id,
      platform: 'TikTok',
      filename: 'tiktok-orders-2024-08.csv',
      size: 786432, // 768KB
      status: 'failed',
      startedAt: subDays(new Date(), 1),
      finishedAt: subDays(new Date(), 1),
      createdBy: 'user-1',
      error: 'Invalid CSV format in row 145',
      hash: 'ghi789'
    }
  ]

  for (const job of importJobs) {
    await prisma.importJob.upsert({
      where: { 
        workspaceId_hash: {
          workspaceId: job.workspaceId,
          hash: job.hash
        }
      },
      update: {},
      create: job
    })
  }

  console.log(`✅ Created ${importJobs.length} sample import jobs`)

  // Create sample import errors for the failed job
  const failedJob = await prisma.importJob.findFirst({
    where: { status: 'failed', workspaceId: workspace.id }
  })

  if (failedJob) {
    const importErrors = [
      {
        jobId: failedJob.id,
        rowNo: 145,
        field: 'amount',
        message: 'Invalid number format',
        sample: 'invalid-amount-value'
      },
      {
        jobId: failedJob.id,
        rowNo: 146,
        field: 'date',
        message: 'Invalid date format',
        sample: '2024-13-45'
      }
    ]

    await prisma.importError.createMany({
      data: importErrors,
      skipDuplicates: true
    })

    console.log(`✅ Created ${importErrors.length} sample import errors`)
  }

  console.log('🎉 Sample data creation completed!')
}

async function main() {
  try {
    await createSampleData()
  } catch (error) {
    console.error('❌ Error creating sample data:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()