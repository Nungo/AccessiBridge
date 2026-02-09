import { useState, useRef, useEffect } from 'react'
import { describeScene, readText, assessNavigation, askFollowUp } from './services/gemini'
import { compressImage } from './utils/imageCompression'

function App() {
  const [mode, setMode] = useState('visual')
  const [visualMode, setVisualMode] = useState('scene')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [continuousMode, setContinuousMode] = useState(false)
  const [followUpMode, setFollowUpMode] = useState(false)
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [lastImageData, setLastImageData] = useState(null)
  const [conversationHistory, setConversationHistory] = useState([])
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [micPermissionGranted, setMicPermissionGranted] = useState(false)
  
  // Hearing mode states - Live Captions
  const [captioningActive, setCaptioningActive] = useState(false)
  const [captions, setCaptions] = useState([])
  const [currentCaption, setCurrentCaption] = useState('')
  
  // Hearing mode states - Sound Detection
  const [soundDetectionActive, setSoundDetectionActive] = useState(false)
  const [soundEvents, setSoundEvents] = useState([])
  const [flashAlert, setFlashAlert] = useState(false)
  const [hearingMode, setHearingMode] = useState('captions')
  const [currentVolume, setCurrentVolume] = useState(0)
  
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const intervalRef = useRef(null)
  const recognitionRef = useRef(null)
  const captionRecognitionRef = useRef(null)
  const speechQueueRef = useRef([])
  const isSpeakingRef = useRef(false)
  const lastImageDataRef = useRef(null)
  const conversationHistoryRef = useRef([])
  const shouldStopSpeechRef = useRef(false)
  const captionsEndRef = useRef(null)
  const soundsEndRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const lastSoundTimeRef = useRef(0)

  useEffect(() => {
    if (captionsEndRef.current) {
      captionsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [captions, currentCaption])

  useEffect(() => {
    if (soundsEndRef.current) {
      soundsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [soundEvents])

  useEffect(() => {
    lastImageDataRef.current = lastImageData
    conversationHistoryRef.current = conversationHistory
  }, [lastImageData, conversationHistory])

  useEffect(() => {
    const saved = localStorage.getItem('accessibridge_conversation')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setConversationHistory(parsed)
      } catch (e) {
        console.error('Failed to load conversation history')
      }
    }
  }, [])

  useEffect(() => {
    if (conversationHistory.length > 0) {
      localStorage.setItem('accessibridge_conversation', JSON.stringify(conversationHistory))
    }
  }, [conversationHistory])

  const addToConversation = (role, content) => {
    setConversationHistory(prev => [...prev, { role, content, timestamp: Date.now() }])
  }

  const clearConversation = () => {
    setConversationHistory([])
    localStorage.removeItem('accessibridge_conversation')
    speakWithQueue("Conversation memory cleared.")
  }

  const addCaption = (text, isFinal) => {
    const timestamp = new Date().toLocaleTimeString()
    
    if (isFinal) {
      setCaptions(prev => [...prev, { text, timestamp, id: Date.now() }])
      setCurrentCaption('')
    } else {
      setCurrentCaption(text)
    }
  }

  const clearCaptions = () => {
    setCaptions([])
    setCurrentCaption('')
  }

  const exportTranscript = () => {
    const transcript = captions.map(c => `[${c.timestamp}] ${c.text}`).join('\n')
    const blob = new Blob([transcript], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcript-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const addSoundEvent = (soundType, urgency, description, volume) => {
    const timestamp = new Date().toLocaleTimeString()
    const event = {
      id: Date.now(),
      soundType,
      urgency,
      description,
      volume,
      timestamp
    }
    
    setSoundEvents(prev => [event, ...prev])
    triggerFlashAlert(urgency)
    triggerHapticFeedback(urgency)
  }

  const triggerFlashAlert = (urgency) => {
    setFlashAlert(urgency)
    setTimeout(() => setFlashAlert(false), urgency === 'urgent' ? 1000 : 500)
  }

  const triggerHapticFeedback = (urgency) => {
    if ('vibrate' in navigator) {
      if (urgency === 'urgent') {
        navigator.vibrate([200, 100, 200, 100, 200])
      } else if (urgency === 'attention') {
        navigator.vibrate([100, 50, 100])
      } else {
        navigator.vibrate(50)
      }
    }
  }

  const clearSoundEvents = () => {
    setSoundEvents([])
  }

  const exportSoundLog = () => {
    const log = soundEvents.map(e => 
      `[${e.timestamp}] ${e.soundType.toUpperCase()} (${e.urgency}) - ${e.description} - Volume: ${e.volume}%`
    ).join('\n')
    const blob = new Blob([log], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sound-log-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Volume-based sound detection - FIXED
  const startSoundDetection = async () => {
    console.log('🎬 Starting sound detection')
    
    if (!micPermissionGranted) {
      const granted = await requestMicrophonePermission()
      if (!granted) {
        alert('Microphone permission is required for sound detection.')
        return
      }
    }

    try {
      console.log('🎤 Requesting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })
      console.log('✅ Microphone access granted')
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      
      analyserRef.current.fftSize = 2048
      analyserRef.current.smoothingTimeConstant = 0.3
      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      
      console.log('✅ Audio analyzer created, buffer length:', bufferLength)
      
      setSoundDetectionActive(true)
      lastSoundTimeRef.current = 0
      
      const detectVolume = () => {
        analyserRef.current.getByteFrequencyData(dataArray)
        
        // Calculate average volume
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        const average = sum / bufferLength
        const volumePercent = Math.round((average / 255) * 100)
        
        setCurrentVolume(volumePercent)
        
        // Log every 30 frames for debugging
        if (Math.random() < 0.033) {
          console.log('📊 Current volume:', volumePercent + '%', 'Raw average:', average)
        }
        
        const now = Date.now()
        const timeSinceLastSound = now - lastSoundTimeRef.current
        
        // Detect loud sounds (threshold: 20% - lowered for testing)
        if (volumePercent > 20 && timeSinceLastSound > 2000) {
          console.log('🔊 SOUND DETECTED! Volume:', volumePercent + '%')
          lastSoundTimeRef.current = now
          
          let soundType = 'unknown'
          let urgency = 'info'
          let description = `Loud sound detected (${volumePercent}% volume)`
          
          // Classify by volume intensity
          if (volumePercent > 60) {
            soundType = 'alarm'
            urgency = 'urgent'
            description = `Very loud sound - ${volumePercent}% volume (possible alarm/horn)`
          } else if (volumePercent > 40) {
            soundType = 'attention'
            urgency = 'attention'
            description = `Loud sound - ${volumePercent}% volume (possible doorbell/phone)`
          } else {
            soundType = 'conversation'
            urgency = 'info'
            description = `Moderate sound - ${volumePercent}% volume (possible conversation)`
          }
          
          addSoundEvent(soundType, urgency, description, volumePercent)
        }
        
        // Continue loop
        animationFrameRef.current = requestAnimationFrame(detectVolume)
      }
      
      console.log('🚀 Starting detection loop')
      detectVolume()
      
    } catch (error) {
      console.error('❌ Sound detection error:', error)
      alert('Could not start sound detection. Error: ' + error.message)
    }
  }

  const stopSoundDetection = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    setSoundDetectionActive(false)
    setCurrentVolume(0)
  }

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'urgent': return 'border-red-500 bg-red-500/20'
      case 'attention': return 'border-yellow-500 bg-yellow-500/20'
      case 'info': return 'border-blue-500 bg-blue-500/20'
      default: return 'border-white/20'
    }
  }

  const getSoundIcon = (soundType) => {
    switch (soundType) {
      case 'alarm': return '🚨'
      case 'attention': return '🔔'
      case 'conversation': return '💬'
      default: return '🔊'
    }
  }

  const stripMarkdown = (text) => {
    return text
      .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s+/g, '')
      .replace(/`{1,3}(.+?)`{1,3}/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/_{2,}/g, '')
      .replace(/~{2}(.+?)~{2}/g, '$1')
  }

  const isStopCommand = (text) => {
    const stopWords = ['done', 'stop', 'exit', 'no more questions', 'finish', 'end', 'quit', 'cancel', 'that\'s all', 'nothing else', 'pause', 'be quiet', 'shut up', 'silence']
    const lowerText = text.toLowerCase().trim()
    return stopWords.some(word => lowerText.includes(word))
  }

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      setMicPermissionGranted(true)
      return true
    } catch (error) {
      console.error('Microphone permission denied:', error)
      setMicPermissionGranted(false)
      return false
    }
  }

  const startCaptioning = async () => {
    if (!micPermissionGranted) {
      const granted = await requestMicrophonePermission()
      if (!granted) {
        alert('Microphone permission is required for live captions.')
        return
      }
    }

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      captionRecognitionRef.current = new SpeechRecognition()
      captionRecognitionRef.current.continuous = true
      captionRecognitionRef.current.interimResults = true
      captionRecognitionRef.current.lang = 'en-US'
      
      captionRecognitionRef.current.onresult = (event) => {
        const result = event.results[event.results.length - 1]
        const transcript = result[0].transcript
        addCaption(transcript, result.isFinal)
      }
      
      captionRecognitionRef.current.onerror = (event) => {
        console.error('Caption recognition error:', event.error)
        if (event.error === 'no-speech') return
        if (event.error === 'not-allowed') {
          alert('Microphone access denied.')
          stopCaptioning()
        }
      }
      
      captionRecognitionRef.current.onend = () => {
        if (captioningActive) {
          try {
            captionRecognitionRef.current.start()
          } catch (e) {
            console.error('Could not restart captioning:', e)
          }
        }
      }
      
      try {
        captionRecognitionRef.current.start()
        setCaptioningActive(true)
      } catch (error) {
        console.error('Could not start captioning:', error)
        alert('Could not start live captions.')
      }
    } else {
      alert('Speech recognition not supported. Please use Chrome or Edge.')
    }
  }

  const stopCaptioning = () => {
    if (captionRecognitionRef.current) {
      captionRecognitionRef.current.stop()
      setCaptioningActive(false)
    }
  }

  const submitFollowUp = async (question) => {
    if (!question.trim() || !lastImageDataRef.current || loading) return
    
    if (isStopCommand(question)) {
      setIsListening(false)
      setFollowUpMode(false)
      setFollowUpQuestion('')
      shouldStopSpeechRef.current = true
      speechSynthesis.cancel()
      speechQueueRef.current = []
      speakWithQueue("Okay, I've stopped. Start a new analysis when you're ready.")
      return
    }
    
    setLoading(true)
    setResponse(`Analyzing: "${question}"...`)
    setFollowUpQuestion('')
    
    addToConversation('user', question)
    
    try {
      const result = await askFollowUp(
        lastImageDataRef.current, 
        question, 
        conversationHistoryRef.current
      )
      setResponse(result)
      addToConversation('assistant', result)
      
      shouldStopSpeechRef.current = false
      speakWithQueue(stripMarkdown(result), () => {
        if (!shouldStopSpeechRef.current) {
          speakWithQueue("Ask another question, or say 'stop' to finish.", () => {
            setTimeout(() => {
              if (!shouldStopSpeechRef.current) {
                startAutoListening()
              }
            }, 500)
          })
        }
      })
      
    } catch (error) {
      const errorMsg = `Error: ${error.message}`
      setResponse(errorMsg)
      speakWithQueue(errorMsg)
      setFollowUpMode(false)
    }
    
    setLoading(false)
  }

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-US'
      recognitionRef.current.maxAlternatives = 1
      
      recognitionRef.current.onresult = (event) => {
        const result = event.results[event.results.length - 1]
        const transcript = result[0].transcript.trim()
        
        if (isStopCommand(transcript)) {
          setFollowUpQuestion(transcript)
          setIsListening(false)
          shouldStopSpeechRef.current = true
          speechSynthesis.cancel()
          speechQueueRef.current = []
          if (recognitionRef.current) {
            recognitionRef.current.stop()
          }
          setTimeout(() => submitFollowUp(transcript), 100)
          return
        }
        
        if (result.isFinal) {
          setFollowUpQuestion(transcript)
          setIsListening(false)
          if (recognitionRef.current) {
            recognitionRef.current.stop()
          }
          setTimeout(() => submitFollowUp(transcript), 100)
        }
      }
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
        
        if (event.error === 'no-speech') {
          setFollowUpMode(false)
        } else if (event.error === 'network') {
          speakWithQueue("Network error.")
          setFollowUpMode(false)
        } else if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          speakWithQueue("Microphone access denied.")
          setFollowUpMode(false)
        }
      }
      
      recognitionRef.current.onend = () => {
        setIsListening(false)
      }
    }
  }, [])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' },
        audio: false
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setCameraActive(true)
      }
      
      if (!micPermissionGranted) {
        await requestMicrophonePermission()
      }
    } catch (error) {
      setResponse(`Camera error: ${error.message}`)
      speakWithQueue(`Camera error.`)
    }
  }

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks()
      tracks.forEach(track => track.stop())
      setCameraActive(false)
      setContinuousMode(false)
      setFollowUpMode(false)
      shouldStopSpeechRef.current = true
      speechSynthesis.cancel()
      speechQueueRef.current = []
      if (recognitionRef.current && isListening) {
        recognitionRef.current.stop()
      }
    }
  }

  const captureFrame = async () => {
    const canvas = canvasRef.current
    const video = videoRef.current
    
    if (!video || !canvas) return null
    
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    const ctx = canvas.getContext('2d')
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
    const compressed = await compressImage(base64, 800, 0.7)
    return compressed
  }

  const speakWithQueue = (text, onComplete) => {
    if (!('speechSynthesis' in window)) {
      if (onComplete) onComplete()
      return
    }

    speechQueueRef.current.push({ text, onComplete })
    
    if (!isSpeakingRef.current) {
      processNextSpeech()
    }
  }

  const processNextSpeech = () => {
    if (shouldStopSpeechRef.current || speechQueueRef.current.length === 0) {
      isSpeakingRef.current = false
      shouldStopSpeechRef.current = false
      return
    }

    isSpeakingRef.current = true
    const { text, onComplete } = speechQueueRef.current.shift()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.9

    utterance.onend = () => {
      if (onComplete && !shouldStopSpeechRef.current) onComplete()
      processNextSpeech()
    }

    utterance.onerror = () => {
      if (onComplete) onComplete()
      processNextSpeech()
    }

    speechSynthesis.speak(utterance)
  }

  const startAutoListening = async () => {
    if (!micPermissionGranted) {
      const granted = await requestMicrophonePermission()
      if (!granted) {
        speakWithQueue("Microphone permission needed.")
        setFollowUpMode(false)
        return
      }
    }

    if (recognitionRef.current && !isListening && !loading) {
      setIsListening(true)
      try {
        setTimeout(() => {
          try {
            recognitionRef.current.start()
          } catch (error) {
            setIsListening(false)
            speakWithQueue("Voice recognition not available.")
            setFollowUpMode(false)
          }
        }, 500)
      } catch (error) {
        setIsListening(false)
        speakWithQueue("Voice recognition not available.")
        setFollowUpMode(false)
      }
    }
  }

  const analyzeScene = async () => {
    if (loading) return
    
    setLoading(true)
    setResponse('Analyzing scene...')
    
    try {
      const imageData = await captureFrame()
      if (!imageData) {
        setResponse('Could not capture image')
        setLoading(false)
        return
      }
      
      setLastImageData(imageData)
      const result = await describeScene(imageData, conversationHistoryRef.current)
      setResponse(result)
      setFollowUpMode(true)
      
      addToConversation('user', 'Describe the scene')
      addToConversation('assistant', result)
      
      shouldStopSpeechRef.current = false
      speakWithQueue(stripMarkdown(result), () => {
        if (!shouldStopSpeechRef.current) {
          speakWithQueue("You can ask a question now, or say 'stop' to finish.", () => {
            setTimeout(() => {
              if (!shouldStopSpeechRef.current) {
                startAutoListening()
              }
            }, 500)
          })
        }
      })
      
    } catch (error) {
      const errorMsg = `Error: ${error.message}`
      setResponse(errorMsg)
      speakWithQueue(errorMsg)
    }
    
    setLoading(false)
  }

  const analyzeText = async () => {
    if (loading) return
    
    setLoading(true)
    setResponse('Reading text...')
    
    try {
      const imageData = await captureFrame()
      if (!imageData) {
        setResponse('Could not capture image')
        setLoading(false)
        return
      }
      
      setLastImageData(imageData)
      const result = await readText(imageData, conversationHistoryRef.current)
      setResponse(result)
      setFollowUpMode(true)
      
      addToConversation('user', 'Read the text')
      addToConversation('assistant', result)
      
      shouldStopSpeechRef.current = false
      speakWithQueue(stripMarkdown(result), () => {
        if (!shouldStopSpeechRef.current) {
          speakWithQueue("You can ask a question now, or say 'stop' to finish.", () => {
            setTimeout(() => {
              if (!shouldStopSpeechRef.current) {
                startAutoListening()
              }
            }, 500)
          })
        }
      })
      
    } catch (error) {
      const errorMsg = `Error: ${error.message}`
      setResponse(errorMsg)
      speakWithQueue(errorMsg)
    }
    
    setLoading(false)
  }

  const analyzeNavigation = async () => {
    if (loading) return
    
    setLoading(true)
    setResponse('Checking navigation...')
    
    try {
      const imageData = await captureFrame()
      if (!imageData) {
        setResponse('Could not capture image')
        setLoading(false)
        return
      }
      
      setLastImageData(imageData)
      const result = await assessNavigation(imageData, conversationHistoryRef.current)
      setResponse(result)
      setFollowUpMode(true)
      
      addToConversation('user', 'Is it safe to proceed?')
      addToConversation('assistant', result)
      
      shouldStopSpeechRef.current = false
      speakWithQueue(stripMarkdown(result), () => {
        if (!shouldStopSpeechRef.current) {
          speakWithQueue("You can ask a question now, or say 'stop' to finish.", () => {
            setTimeout(() => {
              if (!shouldStopSpeechRef.current) {
                startAutoListening()
              }
            }, 500)
          })
        }
      })
      
    } catch (error) {
      const errorMsg = `Error: ${error.message}`
      setResponse(errorMsg)
      speakWithQueue(errorMsg)
    }
    
    setLoading(false)
  }

  const handleManualFollowUp = () => {
    submitFollowUp(followUpQuestion)
  }

  useEffect(() => {
    if (continuousMode && cameraActive) {
      intervalRef.current = setInterval(() => {
        analyzeScene()
      }, 10000)
      analyzeScene()
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [continuousMode, cameraActive])

  useEffect(() => {
    return () => {
      if (captionRecognitionRef.current) {
        captionRecognitionRef.current.stop()
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      stopSoundDetection()
    }
  }, [])

  return (
    <div className="min-h-screen bg-black text-white relative">
      {flashAlert && (
        <div className={`fixed inset-0 z-50 pointer-events-none ${
          flashAlert === 'urgent' ? 'bg-red-500' : 
          flashAlert === 'attention' ? 'bg-yellow-500' : 
          'bg-blue-500'
        } opacity-50 animate-pulse`} />
      )}
      
      <div className="glass-header p-4 md:p-6 border-b border-white/10">
        <h1 className="text-3xl md:text-4xl font-bold text-center bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
          AccessiBridge
        </h1>
        <p className="text-center text-xs md:text-sm text-gray-400 mt-1">AI Accessibility Companion</p>
      </div>

      <div className="flex gap-3 p-4 md:p-6">
        <button
          onClick={() => setMode('visual')}
          className={`flex-1 py-3 md:py-4 rounded-xl font-semibold text-sm md:text-base transition-all ${
            mode === 'visual' 
              ? 'glass-active border border-white/30' 
              : 'glass border border-white/10 hover:border-white/20'
          }`}
        >
          👁️ Visual
        </button>
        <button
          onClick={() => setMode('hearing')}
          className={`flex-1 py-3 md:py-4 rounded-xl font-semibold text-sm md:text-base transition-all ${
            mode === 'hearing' 
              ? 'glass-active border border-white/30' 
              : 'glass border border-white/10 hover:border-white/20'
          }`}
        >
          👂 Hearing
        </button>
      </div>

      {mode === 'visual' && (
        <div className="p-4 md:p-6">
          <div className="mb-6 relative bg-black rounded-2xl overflow-hidden aspect-video max-h-[400px] border border-white/10">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {!cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center glass">
                <p className="text-gray-400 text-sm md:text-base">Camera not active</p>
              </div>
            )}
            {continuousMode && (
              <div className="absolute top-3 right-3 glass-badge px-3 py-1.5 rounded-full text-xs md:text-sm font-bold animate-pulse border border-red-500/50">
                🔴 LIVE
              </div>
            )}
            {isListening && (
              <div className="absolute bottom-3 left-3 glass-badge px-3 py-1.5 rounded-full text-xs md:text-sm font-bold animate-pulse border border-white/50">
                🎤 Listening...
              </div>
            )}
          </div>
          
          {conversationHistory.length > 0 && (
            <button
              onClick={() => setShowHistoryModal(true)}
              className="mb-4 glass px-4 py-2 rounded-xl text-sm font-semibold border border-white/20 hover:border-white/40 transition-all flex items-center gap-2"
            >
              💬 {conversationHistory.length} messages · View History
            </button>
          )}
          
          <canvas ref={canvasRef} className="hidden" />

          {!cameraActive ? (
            <button
              onClick={startCamera}
              className="w-full glass-button py-4 md:py-5 rounded-xl font-semibold text-base md:text-lg mb-4 border border-white/20 hover:border-white/40 transition-all"
            >
              📷 Start Camera
            </button>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <button
                  onClick={() => {
                    setVisualMode('scene')
                    setContinuousMode(false)
                    setFollowUpMode(false)
                  }}
                  className={`py-3 md:py-4 rounded-xl text-xs md:text-sm font-semibold transition-all ${
                    visualMode === 'scene' ? 'glass-active border border-white/30' : 'glass border border-white/10 hover:border-white/20'
                  }`}
                >
                  🔍 Scene
                </button>
                <button
                  onClick={() => {
                    setVisualMode('text')
                    setContinuousMode(false)
                    setFollowUpMode(false)
                  }}
                  className={`py-3 md:py-4 rounded-xl text-xs md:text-sm font-semibold transition-all ${
                    visualMode === 'text' ? 'glass-active border border-white/30' : 'glass border border-white/10 hover:border-white/20'
                  }`}
                >
                  📖 Text
                </button>
                <button
                  onClick={() => {
                    setVisualMode('navigation')
                    setContinuousMode(false)
                    setFollowUpMode(false)
                  }}
                  className={`py-3 md:py-4 rounded-xl text-xs md:text-sm font-semibold transition-all ${
                    visualMode === 'navigation' ? 'glass-active border border-white/30' : 'glass border border-white/10 hover:border-white/20'
                  }`}
                >
                  🧭 Nav
                </button>
              </div>

              <div className="space-y-3 mb-4">
                {visualMode === 'scene' && (
                  <>
                    <button
                      onClick={analyzeScene}
                      disabled={loading || continuousMode}
                      className="w-full glass-button py-4 md:py-5 rounded-xl font-semibold text-base md:text-lg disabled:opacity-50 border border-white/20 hover:border-white/40 transition-all"
                    >
                      {loading ? '⏳ Analyzing...' : '🔍 Describe Scene'}
                    </button>
                    <button
                      onClick={() => setContinuousMode(!continuousMode)}
                      disabled={loading}
                      className={`w-full glass-button py-3 md:py-4 rounded-xl font-semibold text-sm md:text-base border transition-all ${
                        continuousMode 
                          ? 'border-red-500/50 hover:border-red-500/70' 
                          : 'border-white/20 hover:border-white/40'
                      } disabled:opacity-50`}
                    >
                      {continuousMode ? '⏸️ Stop Continuous' : '▶️ Continuous (10s)'}
                    </button>
                  </>
                )}

                {visualMode === 'text' && (
                  <button
                    onClick={analyzeText}
                    disabled={loading}
                    className="w-full glass-button py-4 md:py-5 rounded-xl font-semibold text-base md:text-lg disabled:opacity-50 border border-white/20 hover:border-white/40 transition-all"
                  >
                    {loading ? '⏳ Reading...' : '📖 Read Text'}
                  </button>
                )}

                {visualMode === 'navigation' && (
                  <button
                    onClick={analyzeNavigation}
                    disabled={loading}
                    className="w-full glass-button py-4 md:py-5 rounded-xl font-semibold text-base md:text-lg disabled:opacity-50 border border-white/20 hover:border-white/40 transition-all"
                  >
                    {loading ? '⏳ Checking...' : '🧭 Is It Safe?'}
                  </button>
                )}

                {conversationHistory.length > 0 && (
                  <button
                    onClick={clearConversation}
                    className="w-full glass py-2 md:py-3 rounded-xl font-semibold text-sm border border-white/10 hover:border-white/20 transition-all"
                  >
                    🗑️ Clear Memory
                  </button>
                )}

                <button
                  onClick={stopCamera}
                  className="w-full glass-button py-3 md:py-4 rounded-xl font-semibold text-sm md:text-base border border-red-500/30 hover:border-red-500/50 transition-all"
                >
                  ⏹️ Stop Camera
                </button>
              </div>

              {followUpMode && !continuousMode && (
                <div className="mb-4 glass p-4 rounded-xl border border-white/20">
                  <p className="text-xs md:text-sm font-semibold mb-2">
                    🎤 Voice Control Active
                  </p>
                  <p className="text-xs md:text-sm text-gray-400 mb-3">
                    <strong>Ask:</strong> Just speak!<br/>
                    <strong>Stop:</strong> Say "stop" anytime
                  </p>
                  
                  {followUpQuestion && (
                    <div className="mb-3 p-2 glass rounded-lg text-xs border border-white/10">
                      <strong>Captured:</strong> "{followUpQuestion}"
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={followUpQuestion}
                      onChange={(e) => setFollowUpQuestion(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleManualFollowUp()}
                      placeholder="Or type your question..."
                      className="flex-1 px-3 py-2 glass rounded-lg text-sm border border-white/10 focus:border-white/30 outline-none"
                      disabled={loading}
                    />
                    <button
                      onClick={handleManualFollowUp}
                      disabled={loading || !followUpQuestion.trim()}
                      className="glass-button px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 border border-white/20 hover:border-white/40 transition-all"
                    >
                      Ask
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {response && (
            <div className="glass p-4 rounded-xl border border-white/10">
              <h3 className="font-bold mb-2 text-sm md:text-base">AI Response:</h3>
              <p className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap text-gray-300">{response}</p>
            </div>
          )}
        </div>
      )}

      {mode === 'hearing' && (
        <div className="p-4 md:p-6">
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setHearingMode('captions')}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                hearingMode === 'captions'
                  ? 'glass-active border border-white/30'
                  : 'glass border border-white/10 hover:border-white/20'
              }`}
            >
              📝 Live Captions
            </button>
            <button
              onClick={() => setHearingMode('sounds')}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                hearingMode === 'sounds'
                  ? 'glass-active border border-white/30'
                  : 'glass border border-white/10 hover:border-white/20'
              }`}
            >
              🔊 Sound Detection
            </button>
          </div>

          {hearingMode === 'captions' && (
            <>
              <div className="mb-6 glass rounded-2xl border border-white/10 p-6 min-h-[400px] max-h-[500px] overflow-y-auto">
                <h2 className="text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                  {captioningActive && <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>}
                  Live Captions
                </h2>
                
                {captions.length === 0 && !currentCaption && !captioningActive && (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-lg mb-2">📝 No captions yet</p>
                    <p className="text-sm">Start live captioning to see real-time speech-to-text</p>
                  </div>
                )}
                
                <div className="space-y-3">
                  {captions.map((caption) => (
                    <div key={caption.id} className="glass-active p-3 rounded-lg border border-white/10">
                      <div className="text-xs text-gray-400 mb-1">{caption.timestamp}</div>
                      <p className="text-base md:text-lg leading-relaxed">{caption.text}</p>
                    </div>
                  ))}
                  
                  {currentCaption && (
                    <div className="glass p-3 rounded-lg border border-white/30 animate-pulse">
                      <div className="text-xs text-gray-400 mb-1">Now</div>
                      <p className="text-base md:text-lg leading-relaxed text-gray-300">{currentCaption}</p>
                    </div>
                  )}
                  
                  <div ref={captionsEndRef} />
                </div>
              </div>

              <div className="space-y-3">
                {!captioningActive ? (
                  <button
                    onClick={startCaptioning}
                    className="w-full glass-button py-4 md:py-5 rounded-xl font-semibold text-base md:text-lg border border-white/20 hover:border-white/40 transition-all"
                  >
                    🎤 Start Live Captions
                  </button>
                ) : (
                  <button
                    onClick={stopCaptioning}
                    className="w-full glass-button py-4 md:py-5 rounded-xl font-semibold text-base md:text-lg border border-red-500/50 hover:border-red-500/70 transition-all"
                  >
                    ⏹️ Stop Captions
                  </button>
                )}

                {captions.length > 0 && (
                  <>
                    <button
                      onClick={exportTranscript}
                      className="w-full glass py-3 md:py-4 rounded-xl font-semibold text-sm md:text-base border border-white/20 hover:border-white/40 transition-all"
                    >
                      💾 Export Transcript ({captions.length} captions)
                    </button>
                    
                    <button
                      onClick={clearCaptions}
                      className="w-full glass py-2 md:py-3 rounded-xl font-semibold text-sm border border-white/10 hover:border-white/20 transition-all"
                    >
                      🗑️ Clear Captions
                    </button>
                  </>
                )}
              </div>

              <div className="mt-6 glass p-4 rounded-xl border border-white/10">
                <h3 className="font-bold mb-2 text-sm">How it works:</h3>
                <ul className="text-xs text-gray-400 space-y-1">
                  <li>• Speak or have someone speak near your device</li>
                  <li>• Real-time captions appear automatically</li>
                  <li>• Export transcript as text file</li>
                </ul>
              </div>
            </>
          )}

          {hearingMode === 'sounds' && (
            <>
              <div className="mb-6 glass rounded-2xl border border-white/10 p-6 min-h-[400px] max-h-[500px] overflow-y-auto">
                <h2 className="text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                  {soundDetectionActive && <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>}
                  Sound Events
                  {soundDetectionActive && (
                    <span className="text-sm text-gray-400">
                      Volume: {currentVolume}%
                    </span>
                  )}
                </h2>
                
                {soundDetectionActive && (
                  <div className="mb-4 glass p-3 rounded-lg border border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-16">Level:</span>
                      <div className="flex-1 h-3 glass rounded-full overflow-hidden border border-white/20">
                        <div 
                          className={`h-full transition-all duration-100 ${
                            currentVolume > 60 ? 'bg-red-500' :
                            currentVolume > 40 ? 'bg-yellow-500' :
                            currentVolume > 20 ? 'bg-green-500' :
                            'bg-blue-500'
                          }`}
                          style={{ width: `${currentVolume}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono w-12">{currentVolume}%</span>
                    </div>
                  </div>
                )}
                
                {soundEvents.length === 0 && !soundDetectionActive && (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-lg mb-2">🔇 No sounds detected yet</p>
                    <p className="text-sm">Start sound detection to get real-time alerts</p>
                  </div>
                )}
                
                {soundEvents.length === 0 && soundDetectionActive && (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-lg mb-2 animate-pulse">👂 Listening for sounds...</p>
                    <p className="text-sm">Make a loud noise to test detection</p>
                    <p className="text-xs mt-2 text-gray-500">Threshold: 20% volume</p>
                  </div>
                )}
                
                <div className="space-y-3">
                  {soundEvents.map((event) => (
                    <div key={event.id} className={`p-4 rounded-lg border-2 ${getUrgencyColor(event.urgency)} transition-all animate-fadeIn`}>
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">{getSoundIcon(event.soundType)}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm uppercase">{event.soundType}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              event.urgency === 'urgent' ? 'bg-red-500' :
                              event.urgency === 'attention' ? 'bg-yellow-500' :
                              'bg-blue-500'
                            }`}>
                              {event.urgency}
                            </span>
                            <span className="text-xs text-gray-400">{event.volume}%</span>
                          </div>
                          <p className="text-sm text-gray-300 mb-1">{event.description}</p>
                          <p className="text-xs text-gray-500">{event.timestamp}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <div ref={soundsEndRef} />
                </div>
              </div>

              <div className="space-y-3">
                {!soundDetectionActive ? (
                  <button
                    onClick={startSoundDetection}
                    className="w-full glass-button py-4 md:py-5 rounded-xl font-semibold text-base md:text-lg border border-white/20 hover:border-white/40 transition-all"
                  >
                    🔊 Start Sound Detection
                  </button>
                ) : (
                  <button
                    onClick={stopSoundDetection}
                    className="w-full glass-button py-4 md:py-5 rounded-xl font-semibold text-base md:text-lg border border-red-500/50 hover:border-red-500/70 transition-all"
                  >
                    ⏹️ Stop Detection
                  </button>
                )}

                {soundEvents.length > 0 && (
                  <>
                    <button
                      onClick={exportSoundLog}
                      className="w-full glass py-3 md:py-4 rounded-xl font-semibold text-sm md:text-base border border-white/20 hover:border-white/40 transition-all"
                    >
                      💾 Export Sound Log ({soundEvents.length} events)
                    </button>
                    
                    <button
                      onClick={clearSoundEvents}
                      className="w-full glass py-2 md:py-3 rounded-xl font-semibold text-sm border border-white/10 hover:border-white/20 transition-all"
                    >
                      🗑️ Clear Log
                    </button>
                  </>
                )}
              </div>

              <div className="mt-6 glass p-4 rounded-xl border border-white/10">
                <h3 className="font-bold mb-2 text-sm">How it works:</h3>
                <ul className="text-xs text-gray-400 space-y-1">
                  <li>• Detects sounds above 20% volume threshold</li>
                  <li>• Real-time volume meter shows audio level</li>
                  <li>• Screen flashes when sound detected</li>
                  <li>• Phone vibrates for alerts</li>
                  <li>• Volume-based classification (60%+ = urgent, 40%+ = attention, 20%+ = info)</li>
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowHistoryModal(false)}>
          <div className="glass max-w-2xl w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-white/20 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Conversation History</h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="glass px-3 py-1 rounded-lg text-sm border border-white/20 hover:border-white/40"
              >
                ✕ Close
              </button>
            </div>
            <div className="space-y-3">
              {conversationHistory.map((msg, idx) => (
                <div key={idx} className={`p-3 rounded-lg ${msg.role === 'user' ? 'glass border border-white/10' : 'glass-active border border-white/20'}`}>
                  <div className="text-xs text-gray-400 mb-1">
                    {msg.role === 'user' ? '👤 You' : '🤖 AI'} · {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                  <p className="text-sm">{msg.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App