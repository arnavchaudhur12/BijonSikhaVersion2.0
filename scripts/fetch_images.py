import os

folder = r"E:\bijonsikha-website\images\birthdays"
image_extensions = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp')

image_paths = [
    os.path.join(folder, f)
    for f in os.listdir(folder)
    if f.lower().endswith(image_extensions)
]

print(','.join(image_paths))