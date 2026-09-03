from PIL import Image
import os

os.chdir('/c/Users/123/Downloads/scherz-trucking-app-new/public')
img = Image.open('logo.png')

# Create favicon sizes
for size in [(64, 64), (32, 32), (16, 16)]:
    resized = img.resize(size, Image.LANCZOS)
    resized.save(f'favicon-{size[0]}x{size[1]}.png')
    print(f'Created favicon-{size[0]}x{size[1]}.png')

# Also copy as favicon.png for the shortcut
img64 = img.resize((64, 64), Image.LANCZOS)
img64.save('favicon.png')
print('Created favicon.png')
print('Done')
