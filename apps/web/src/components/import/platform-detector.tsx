/**
 * Platform Detection Component
 * Automatically detects e-commerce platform from CSV file with confidence indicators
 */

'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { 
  Search, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  RefreshCw,
  Target,
  BarChart3,
  Zap,
  FileText,
  Globe
} from 'lucide-react'

interface PlatformMatch {
  platform: string
  score: number
  confidence: number
  matchedHeaders: string[]
  missingHeaders: string[]
  reasons: Array<{
    type: string
    description: string
    weight: number
    evidence: any
  }>
}

interface PlatformDetectionResult {
  platform: string | null
  confidence: number
  isReliable: boolean
  summary: string
  recommendations: string[]
  matches: PlatformMatch[]
  analysis: {
    totalHeaders: number
    sampleRows: number
    detectedLanguage: string | null
    detectedCurrency: string | null
    structureScore: number
    dataQualityScore: number
    contentPatterns: string[]
  }
  supportedPlatforms: string[]
  threshold: number
  suggestions: string[]
}

interface PlatformDetectorProps {
  fileContent?: string
  fileUrl?: string
  onDetectionComplete?: (result: PlatformDetectionResult) => void
  onPlatformSelect?: (platform: string) => void
  autoDetect?: boolean
  showDetails?: boolean
}

export function PlatformDetector({
  fileContent,
  fileUrl,
  onDetectionComplete,
  onPlatformSelect,
  autoDetect = true,
  showDetails = true
}: PlatformDetectorProps) {
  const [detectionResult, setDetectionResult] = useState<PlatformDetectionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)

  const detectPlatform = useCallback(async () => {
    if (!fileContent && !fileUrl) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/import/detect-platform', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: fileContent,
          fileUrl: fileUrl,
          sampleSize: 50
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Platform detection failed')
      }

      setDetectionResult(data)
      
      if (data.detection.platform) {
        setSelectedPlatform(data.detection.platform)
      }

      if (onDetectionComplete) {
        onDetectionComplete(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }, [fileContent, fileUrl, onDetectionComplete])

  useEffect(() => {
    if (autoDetect && (fileContent || fileUrl)) {
      detectPlatform()
    }
  }, [autoDetect, fileContent, fileUrl, detectPlatform])

  const handlePlatformSelect = (platform: string) => {
    setSelectedPlatform(platform)
    if (onPlatformSelect) {
      onPlatformSelect(platform)
    }
  }

  const getPlatformDisplayName = (platform: string) => {
    const displayNames: Record<string, string> = {
      shopee: 'Shopee',
      lazada: 'Lazada',
      tiktok: 'TikTok Shop'
    }
    return displayNames[platform] || platform
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.6) return 'text-blue-600'
    if (confidence >= 0.4) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getConfidenceBadgeVariant = (confidence: number): "default" | "secondary" | "outline" | "destructive" => {
    if (confidence >= 0.8) return 'default'
    if (confidence >= 0.6) return 'secondary'
    if (confidence >= 0.4) return 'outline'
    return 'destructive'
  }

  const getLanguageIcon = (language: string | null) => {
    if (language === 'thai') return '🇹🇭'
    if (language === 'english') return '🇺🇸'
    return '🌐'
  }

  const getCurrencyIcon = (currency: string | null) => {
    if (currency === 'THB') return '฿'
    if (currency === 'USD') return '$'
    if (currency === 'EUR') return '€'
    return '💰'
  }

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <Search className="h-4 w-4 animate-pulse" />
            <span>Detecting platform...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={detectPlatform}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!detectionResult) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <Search className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Platform Detection</p>
              <p className="text-sm text-muted-foreground">
                Upload a CSV file to automatically detect the e-commerce platform
              </p>
            </div>
            {(fileContent || fileUrl) && (
              <Button onClick={detectPlatform}>
                <Search className="h-4 w-4 mr-2" />
                Detect Platform
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="w-full space-y-4">
      {/* Detection Result Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-lg flex items-center">
              <Zap className="h-5 w-5 mr-2" />
              Platform Detection
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {(detectionResult as any).detection?.summary || 'Platform detection analysis'}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge 
              variant={getConfidenceBadgeVariant((detectionResult as any).detection?.confidence || detectionResult.confidence || 0)}
              className="text-xs"
            >
              {Math.round(((detectionResult as any).detection?.confidence || detectionResult.confidence || 0) * 100)}% confidence
            </Badge>
            <Button variant="ghost" size="sm" onClick={detectPlatform}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Quick Analysis */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">{detectionResult.analysis.totalHeaders}</p>
                <p className="text-xs text-muted-foreground">Headers Found</p>
              </div>
              <FileText className="h-6 w-6 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">{detectionResult.analysis.sampleRows}</p>
                <p className="text-xs text-muted-foreground">Sample Rows</p>
              </div>
              <BarChart3 className="h-6 w-6 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-1">
                  <span className="text-lg">
                    {getLanguageIcon(detectionResult.analysis.detectedLanguage)}
                  </span>
                  <p className="text-sm font-medium capitalize">
                    {detectionResult.analysis.detectedLanguage || 'Unknown'}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Language</p>
              </div>
              <Globe className="h-6 w-6 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-1">
                  <span className="text-lg">
                    {getCurrencyIcon(detectionResult.analysis.detectedCurrency)}
                  </span>
                  <p className="text-sm font-medium">
                    {detectionResult.analysis.detectedCurrency || 'Unknown'}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Currency</p>
              </div>
              <Target className="h-6 w-6 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Matches */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform Matches</CardTitle>
          <p className="text-sm text-muted-foreground">
            Confidence scores for each supported platform
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {detectionResult.matches
              .sort((a, b) => b.confidence - a.confidence)
              .map((match, index) => (
                <div 
                  key={match.platform} 
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedPlatform === match.platform 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => handlePlatformSelect(match.platform)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {selectedPlatform === match.platform && (
                        <CheckCircle className="h-4 w-4 text-blue-500" />
                      )}
                      <div>
                        <p className="font-medium">{getPlatformDisplayName(match.platform)}</p>
                        <p className="text-sm text-muted-foreground">
                          {match.matchedHeaders.length} of {match.matchedHeaders.length + match.missingHeaders.length} headers matched
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${getConfidenceColor(match.confidence)}`}>
                        {Math.round(match.confidence * 100)}%
                      </div>
                      <Progress 
                        value={match.confidence * 100} 
                        className="h-2 w-20" 
                      />
                    </div>
                  </div>

                  {showDetails && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {match.matchedHeaders.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-green-600 mb-1">
                            Matched Headers ({match.matchedHeaders.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {match.matchedHeaders.slice(0, 5).map((header, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {header}
                              </Badge>
                            ))}
                            {match.matchedHeaders.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{match.matchedHeaders.length - 5} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {match.missingHeaders.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-red-600 mb-1">
                            Missing Headers ({match.missingHeaders.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {match.missingHeaders.slice(0, 3).map((header, idx) => (
                              <Badge key={idx} variant="destructive" className="text-xs">
                                {header}
                              </Badge>
                            ))}
                            {match.missingHeaders.length > 3 && (
                              <Badge variant="destructive" className="text-xs">
                                +{match.missingHeaders.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Quality Scores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Quality Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {Math.round(detectionResult.analysis.structureScore)}%
              </div>
              <p className="text-sm text-muted-foreground mb-2">Structure Score</p>
              <Progress 
                value={detectionResult.analysis.structureScore} 
                className="h-2" 
              />
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {Math.round(detectionResult.analysis.dataQualityScore)}%
              </div>
              <p className="text-sm text-muted-foreground mb-2">Data Quality Score</p>
              <Progress 
                value={detectionResult.analysis.dataQualityScore} 
                className="h-2" 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {((detectionResult as any).detection?.recommendations || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {((detectionResult as any).detection?.recommendations || []).map((recommendation: any, index: number) => (
                <Alert key={index}>
                  <Info className="h-4 w-4" />
                  <AlertDescription>{recommendation}</AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Patterns */}
      {showDetails && detectionResult.analysis.contentPatterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detected Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {detectionResult.analysis.contentPatterns.map((pattern, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {pattern.replace('_', ' ')}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Detection threshold: {Math.round(detectionResult.threshold * 100)}%
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" onClick={detectPlatform}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Re-detect
          </Button>
          {selectedPlatform && (
            <Button size="sm" onClick={() => handlePlatformSelect(selectedPlatform)}>
              Use {getPlatformDisplayName(selectedPlatform)}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PlatformDetector