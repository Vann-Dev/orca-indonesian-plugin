"""Draws the plugin icon and directory cover used by Orca's plugin listing."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

BG = (14, 17, 22)
PANEL = (23, 27, 34)
TEXT = (232, 236, 241)
MUTED = (128, 138, 150)
ACCENT = (225, 65, 52)
ACCENT_SOFT = (255, 148, 118)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "/usr/share/fonts/noto/NotoSans-Bold.ttf" if bold else "/usr/share/fonts/noto/NotoSans-Regular.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size)


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def icon(size: int = 256) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    rounded(draw, (0, 0, size - 1, size - 1), 56, BG)

    # Two text lines, the lower one in the Indonesian flag colours.
    rounded(draw, (44, 78, 212, 98), 10, TEXT)
    rounded(draw, (44, 112, 168, 132), 10, MUTED)
    rounded(draw, (44, 158, 212, 178), 10, ACCENT)

    return image


def cover(width: int = 1600, height: int = 1000) -> Image.Image:
    image = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(image)

    # A window in the style of Orca's settings pane.
    rounded(draw, (150, 120, 1450, 880), 28, PANEL)
    draw.rectangle((150, 120, 1450, 186), fill=(31, 36, 45))
    for index, colour in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        cx = 196 + index * 34
        draw.ellipse((cx, 141, cx + 22, 163), fill=colour)

    heading = font(56, bold=True)
    body = font(34)
    small = font(28)
    label = font(30, bold=True)

    draw.text((230, 240), "Pengaturan", font=heading, fill=TEXT)
    draw.text((230, 320), "Tampilan › Bahasa", font=body, fill=MUTED)

    rounded(draw, (230, 396, 1046, 486), 16, (30, 35, 44))
    draw.text((262, 416), "Bahasa antarmuka", font=body, fill=TEXT)
    draw.text((1014, 416), "Bahasa Indonesia", font=body, fill=ACCENT_SOFT, anchor="ra")

    rounded(draw, (230, 512, 1046, 602), 16, (30, 35, 44))
    draw.text((262, 532), "Terjemahan", font=body, fill=TEXT)
    draw.text((1014, 532), "21.810 teks", font=body, fill=MUTED, anchor="ra")

    rounded(draw, (230, 628, 1046, 718), 16, (30, 35, 44))
    draw.text((262, 648), "Perubahan tampilan", font=body, fill=TEXT)
    draw.text((1014, 648), "Langsung", font=body, fill=MUTED, anchor="ra")

    # Sidebar of settings sections.
    for index, name in enumerate(["Umum", "Tampilan", "Terminal", "Agen", "Plugin", "Akun"]):
        y = 260 + index * 76
        active = name == "Tampilan"
        if active:
            rounded(draw, (1130, y - 12, 1390, y + 44), 12, (40, 46, 58))
        draw.text((1158, y), name, font=label if active else small, fill=TEXT if active else MUTED)

    # Flag stripe under the window, drawn as a nod to the locale.
    draw.rectangle((150, 902, 1450, 934), fill=ACCENT)
    draw.rectangle((150, 934, 1450, 966), fill=(240, 242, 245))

    return image


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    icon().save(ASSETS / "icon.png", optimize=True)
    cover().save(ASSETS / "cover.png", optimize=True)


if __name__ == "__main__":
    main()
