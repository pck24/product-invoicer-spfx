# Weiß → transparent ("color to alpha" gegen Weiß): Kanten bleiben auf weißem Grund identisch.
import sys
import numpy as np
from PIL import Image
src, dest = sys.argv[1], sys.argv[2]
rgb = np.asarray(Image.open(src).convert('RGB')).astype(np.float64) / 255.0
alpha = np.max(1.0 - rgb, axis=2)                      # Abstand zu Weiß
safe = np.where(alpha > 0, alpha, 1.0)[..., None]
color = np.clip((rgb - (1.0 - alpha[..., None])) / safe, 0, 1)
out = np.dstack([color, alpha]) * 255.0
Image.fromarray(out.round().astype(np.uint8), 'RGBA').save(dest, optimize=True)
a = out[..., 3]
print('transparent:', round(float((a == 0).mean()) * 100, 1), '% der Fläche')
