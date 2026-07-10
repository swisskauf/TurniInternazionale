export const preprocessImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Could not get 2d context"));
        return;
      }
      
      // Scale down if too large to save tokens and processing time
      const MAX_WIDTH = 1600;
      const MAX_HEIGHT = 1600;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw original image
      ctx.drawImage(img, 0, 0, width, height);

      // Get image data for processing
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // Simple contrast enhancement and grayscale
      const contrast = 1.5; // Increase contrast
      const intercept = 128 * (1 - contrast);

      for (let i = 0; i < data.length; i += 4) {
        // Grayscale conversion
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // Apply contrast
        let newGray = gray * contrast + intercept;
        newGray = Math.max(0, Math.min(255, newGray));

        // Binarization (thresholding) to make text pop
        // If it's dark, make it black, if it's light, make it white
        const threshold = 160;
        const finalVal = newGray < threshold ? 0 : 255;

        data[i] = finalVal;     // R
        data[i + 1] = finalVal; // G
        data[i + 2] = finalVal; // B
        // Alpha remains unchanged
      }

      ctx.putImageData(imageData, 0, 0);
      
      // Convert back to base64
      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      // Remove the data:image/jpeg;base64, prefix for Gemini
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};
