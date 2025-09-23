"use client"

import { useState, useEffect, useCallback, useRef } from 'react'

interface TouchGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onTap?: () => void
  onLongPress?: () => void
  swipeThreshold?: number
  longPressDelay?: number
}

interface TouchPosition {
  x: number
  y: number
}

export function useMobileGestures(options: TouchGestureOptions = {}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onTap,
    onLongPress,
    swipeThreshold = 50,
    longPressDelay = 500
  } = options

  const [touchStart, setTouchStart] = useState<TouchPosition | null>(null)
  const [touchEnd, setTouchEnd] = useState<TouchPosition | null>(null)
  const [isLongPress, setIsLongPress] = useState(false)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)

  // Reset long press state
  const resetLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    setIsLongPress(false)
  }, [])

  const onTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    setTouchStart({ x: touch.clientX, y: touch.clientY })
    setTouchEnd(null)
    
    // Start long press timer
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        setIsLongPress(true)
        onLongPress()
      }, longPressDelay)
    }
  }, [onLongPress, longPressDelay])

  const onTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    setTouchEnd({ x: touch.clientX, y: touch.clientY })
    
    // Cancel long press if moved
    resetLongPress()
  }, [resetLongPress])

  const onTouchEnd = useCallback((e: TouchEvent) => {
    resetLongPress()
    
    if (!touchStart || !touchEnd) {
      // Single tap
      if (touchStart && !isLongPress) {
        onTap?.()
      }
      return
    }

    const distanceX = touchStart.x - touchEnd.x
    const distanceY = touchStart.y - touchEnd.y
    const isLeftSwipe = distanceX > swipeThreshold
    const isRightSwipe = distanceX < -swipeThreshold
    const isUpSwipe = distanceY > swipeThreshold
    const isDownSwipe = distanceY < -swipeThreshold

    // Determine primary direction (horizontal or vertical)
    if (Math.abs(distanceX) > Math.abs(distanceY)) {
      // Horizontal swipe
      if (isLeftSwipe) {
        onSwipeLeft?.()
      } else if (isRightSwipe) {
        onSwipeRight?.()
      }
    } else {
      // Vertical swipe
      if (isUpSwipe) {
        onSwipeUp?.()
      } else if (isDownSwipe) {
        onSwipeDown?.()
      }
    }

    // Reset
    setTouchStart(null)
    setTouchEnd(null)
  }, [touchStart, touchEnd, isLongPress, swipeThreshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onTap, resetLongPress])

  const gestureHandlers = {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetLongPress()
    }
  }, [resetLongPress])

  return gestureHandlers
}

// Hook for pull-to-refresh functionality
export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef(0)
  const currentY = useRef(0)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only trigger if scrolled to top
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY
    }
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startY.current === 0 || window.scrollY > 0) return

    currentY.current = e.touches[0].clientY
    const distance = currentY.current - startY.current

    if (distance > 0) {
      e.preventDefault()
      setPullDistance(Math.min(distance, 100))
    }
  }, [])

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance > 60 && !isRefreshing) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
      }
    }
    
    setPullDistance(0)
    startY.current = 0
    currentY.current = 0
  }, [pullDistance, isRefreshing, onRefresh])

  const pullToRefreshHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  }

  return {
    pullToRefreshHandlers,
    isRefreshing,
    pullDistance,
  }
}

// Hook for detecting mobile device type
export function useMobileDetection() {
  const [deviceInfo, setDeviceInfo] = useState({
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    isIOS: false,
    isAndroid: false,
    supportsTouch: false,
  })

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase()
    const isMobile = window.innerWidth < 768
    const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024
    const isDesktop = window.innerWidth >= 1024
    const isIOS = /iphone|ipad|ipod/.test(userAgent)
    const isAndroid = /android/.test(userAgent)
    const supportsTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0

    setDeviceInfo({
      isMobile,
      isTablet,
      isDesktop,
      isIOS,
      isAndroid,
      supportsTouch,
    })

    const handleResize = () => {
      const newIsMobile = window.innerWidth < 768
      const newIsTablet = window.innerWidth >= 768 && window.innerWidth < 1024
      const newIsDesktop = window.innerWidth >= 1024

      setDeviceInfo(prev => ({
        ...prev,
        isMobile: newIsMobile,
        isTablet: newIsTablet,
        isDesktop: newIsDesktop,
      }))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return deviceInfo
}

// Hook for handling safe area on mobile devices
export function useSafeArea() {
  const [safeArea, setSafeArea] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })

  useEffect(() => {
    const updateSafeArea = () => {
      const style = getComputedStyle(document.documentElement)
      setSafeArea({
        top: parseInt(style.getPropertyValue('--sat') || '0', 10),
        right: parseInt(style.getPropertyValue('--sar') || '0', 10),
        bottom: parseInt(style.getPropertyValue('--sab') || '0', 10),
        left: parseInt(style.getPropertyValue('--sal') || '0', 10),
      })
    }

    updateSafeArea()
    
    // Listen for orientation changes
    window.addEventListener('orientationchange', updateSafeArea)
    window.addEventListener('resize', updateSafeArea)

    return () => {
      window.removeEventListener('orientationchange', updateSafeArea)
      window.removeEventListener('resize', updateSafeArea)
    }
  }, [])

  return safeArea
}