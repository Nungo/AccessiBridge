// Compress image before sending to API
export const compressImage = (base64Image, maxWidth = 800, quality = 0.8) => {
  return new Promise((resolve) => {
    const img = new Image()
    img.src = `data:image/jpeg;base64,${base64Image}`
    
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height
      
      // Resize if larger than maxWidth
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }
      
      canvas.width = width
      canvas.height = height
      
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      
      // Get compressed base64
      const compressed = canvas.toDataURL('image/jpeg', quality).split(',')[1]
      resolve(compressed)
    }
  })
}