"""Create original MIT sample media; requires Python 3 and FFmpeg."""
from pathlib import Path
import math
import struct
import subprocess
import wave

root = Path(__file__).resolve().parents[1]
assets = root / 'ui' / 'gohtmx' / 'assets'
gallery = root / 'internal/gallery/assets'
(assets / 'sample.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="Geometric sample">
<rect width="640" height="360" fill="#eef2ff"/><circle cx="470" cy="110" r="55" fill="#335cff"/>
<path d="M0 360 220 100 440 360Z" fill="#14213a"/><path d="M220 360 440 160 640 360Z" fill="#8ca4ff"/>
</svg>\n''')
(assets / 'sample-before.svg').write_text((assets / 'sample.svg').read_text().replace('#335cff', '#96523e').replace('#8ca4ff', '#e7a38b'))
with wave.open(str(gallery / 'audit-tone.wav'), 'wb') as audio:
    audio.setparams((1, 2, 8000, 16000, 'NONE', 'not compressed'))
    audio.writeframes(b''.join(struct.pack('<h', int(1600 * math.sin(2 * math.pi * 440 * i / 8000))) for i in range(16000)))
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i',
                'testsrc2=size=160x90:rate=10:duration=2', '-threads', '1',
                '-loop', '0', str(assets / 'sample.gif')], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i',
                'testsrc2=size=160x90:rate=10:duration=2', '-c:v', 'libx264',
                '-threads', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                str(gallery / 'audit-video.mp4')], check=True)
assert (assets / 'sample.gif').stat().st_size > 0
assert (gallery / 'audit-video.mp4').stat().st_size > 0

native = assets / 'ely'
native.mkdir(exist_ok=True)
(native / 'native-architecture.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600" role="img" aria-label="Sunlit architectural stairwell">\n<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#f4eee5"/><stop offset="1" stop-color="#d7c7b4"/></linearGradient><linearGradient id="wall" x2="1"><stop stop-color="#c9b49c"/><stop offset="1" stop-color="#f8f4ed"/></linearGradient></defs>\n<rect width="960" height="600" fill="url(#sky)"/><path fill="#e9dfd1" d="M0 0h500v600H0z"/><path fill="url(#wall)" d="M420 0h540v600H420z"/><path fill="#bca48b" d="M120 600 520 190h440v410z"/><path fill="#eee6da" d="M0 600 420 190h100L160 600z"/><path fill="#d7c6b4" d="m160 600 360-410 88 0-360 410z"/><path fill="#a68d74" d="m294 448 366-258 34 0-366 258zm-88 92 366-258 34 0-366 258z"/><path fill="#fffaf0" d="M665 0h295v360L665 165z" opacity=".82"/><path fill="#8a735e" d="M750 600h210V385L750 510z"/><circle cx="135" cy="500" r="42" fill="#657f68"/><circle cx="176" cy="475" r="27" fill="#789070"/>\n</svg>\n')
with wave.open(str(native / 'native-tone.wav'), 'wb') as audio:
    audio.setparams((1, 2, 44100, 88200, 'NONE', 'not compressed'))
    audio.writeframes(b''.join(struct.pack('<h', int(1200 * math.sin(2 * math.pi * 440 * i / 44100))) for i in range(88200)))
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i',
                'color=c=0x252525:size=640x360:rate=24:duration=2',
                '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
                '-c:v', 'libvpx-vp9', '-threads', '1', '-pix_fmt', 'yuv420p',
                '-c:a', 'libopus', '-af', 'volume=0.04', '-shortest',
                str(native / 'native-neutral.webm')], check=True)
assert (native / 'native-tone.wav').stat().st_size > 0
assert (native / 'native-neutral.webm').stat().st_size > 0
