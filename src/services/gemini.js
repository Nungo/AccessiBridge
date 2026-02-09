const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

// Scene description
export const describeScene = async (imageBase64, conversationHistory = []) => {
  try {
    let contextPrompt = ''
    if (conversationHistory.length > 0) {
      contextPrompt = '\n\nPrevious conversation:\n'
      conversationHistory.slice(-5).forEach(msg => {
        contextPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`
      })
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `You are an AI assistant helping visually impaired users. Analyze this image and provide a detailed description following this exact structure:

1. **Overall scene/location type**: Describe whether this is indoors/outdoors, the type of space, and general atmosphere.

2. **Major objects and their spatial positions**: List key objects/people and where they are positioned (ahead/behind, left/right, near/far).

3. **People present**: Describe any people, their position, what they're doing, clothing, or distinguishing features.

4. **Notable colors and lighting**: Describe dominant colors and lighting conditions.

5. **Any text visible**: If there is readable text, transcribe it exactly.

6. **Potential hazards**: Mention any immediate safety concerns like stairs, obstacles, or moving objects.${contextPrompt}`
              },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: imageBase64
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.4,
            topK: 32,
            topP: 1,
            maxOutputTokens: 2048,
          }
        })
      }
    )

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }

    const data = await response.json()
    return data.candidates[0].content.parts[0].text

  } catch (error) {
    console.error('Error describing scene:', error)
    throw error
  }
}

// Text reading (OCR)
export const readText = async (imageBase64, conversationHistory = []) => {
  try {
    let contextPrompt = ''
    if (conversationHistory.length > 0) {
      contextPrompt = '\n\nPrevious conversation:\n'
      conversationHistory.slice(-5).forEach(msg => {
        contextPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`
      })
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `You are helping a visually impaired person read text from an image.

Instructions:
1. Extract and read ALL visible text from the image
2. Maintain the original formatting and structure
3. If there's a title or heading, mention it first
4. Read text in natural reading order (top to bottom, left to right)
5. If no text is visible, clearly state "No readable text found in this image"
6. If text is partially obscured or unclear, mention which parts are unclear

Please read the text now:${contextPrompt}`
              },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: imageBase64
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            topK: 32,
            topP: 1,
            maxOutputTokens: 2048,
          }
        })
      }
    )

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }

    const data = await response.json()
    return data.candidates[0].content.parts[0].text

  } catch (error) {
    console.error('Error reading text:', error)
    throw error
  }
}

// Navigation safety assessment
export const assessNavigation = async (imageBase64, conversationHistory = []) => {
  try {
    let contextPrompt = ''
    if (conversationHistory.length > 0) {
      contextPrompt = '\n\nPrevious conversation:\n'
      conversationHistory.slice(-5).forEach(msg => {
        contextPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`
      })
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `You are helping a visually impaired person navigate safely. Analyze the path ahead and provide a safety assessment.

Provide:
1. **Overall Safety Status**: Start with "SAFE to proceed" or "CAUTION" or "DANGER - STOP"

2. **Path Description**: Describe the pathway/area directly ahead

3. **Obstacles**: List any obstacles, their position, and distance if visible

4. **Hazards**: Identify stairs, drop-offs, moving objects, uneven surfaces, wet floors

5. **Recommended Action**: Give clear guidance (e.g., "Clear path ahead, safe to walk forward" or "Stop - stairs detected 2 meters ahead")

6. **Alternative Routes**: If hazards present, suggest safer alternatives if visible${contextPrompt}`
              },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: imageBase64
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.3,
            topK: 32,
            topP: 1,
            maxOutputTokens: 1024,
          }
        })
      }
    )

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }

    const data = await response.json()
    return data.candidates[0].content.parts[0].text

  } catch (error) {
    console.error('Error assessing navigation:', error)
    throw error
  }
}

// Follow-up questions
export const askFollowUp = async (imageBase64, question, conversationHistory = []) => {
  try {
    let contextPrompt = ''
    if (conversationHistory.length > 0) {
      contextPrompt = '\n\nPrevious conversation:\n'
      conversationHistory.slice(-5).forEach(msg => {
        contextPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`
      })
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `You are helping a visually impaired person understand an image. Answer their question clearly and concisely, focusing on the specific details they're asking about.${contextPrompt}

User's question: ${question}

Please provide a helpful, detailed answer based on what you see in the image.`
              },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: imageBase64
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.4,
            topK: 32,
            topP: 1,
            maxOutputTokens: 1024,
          }
        })
      }
    )

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }

    const data = await response.json()
    return data.candidates[0].content.parts[0].text

  } catch (error) {
    console.error('Error in follow-up:', error)
    throw error
  }
}