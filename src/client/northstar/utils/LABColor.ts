
export class LABColor {
    public L: number;
    public A: number;
    public B: number;

    // constructor - takes three floats for lightness and color-opponent dimensions
    constructor(l: number, a: number, b: number) {
        this.L = l;
        this.A = a;
        this.B = b;
    }

    // static function for linear interpolation between two LABColors
    public static Lerp(a: LABColor, b: LABColor, t: number): LABColor {
        return new LABColor(LABColor.LerpNumber(a.L, b.L, t), LABColor.LerpNumber(a.A, b.A, t), LABColor.LerpNumber(a.B, b.B, t));
    }

    public static LerpNumber(a: number, b: number, percent: number): number {
        return a + percent * (b - a);
    }

    static hexToRGB(hex: number, alpha: number): number[] {
        var r = (hex & (0xff << 16)) >> 16;
        var g = (hex & (0xff << 8)) >> 8;
        var b = (hex & (0xff << 0)) >> 0;
        return [r, g, b];
    }
    static RGBtoHex(red: number, green: number, blue: number): number {
        return blue | (green << 8) | (red << 16);
    }

    public static RGBtoHexString(rgb: number): string {
        let str = "#" + this.hex((rgb & (0xff << 16)) >> 16) + this.hex((rgb & (0xff << 8)) >> 8) + this.hex((rgb & (0xff << 0)) >> 0);
        return str;
    }

    static hex(x: number): string {
        var hexDigits = new Array
            ("0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f");
        return isNaN(x) ? "00" : hexDigits[(x - x % 16) / 16] + hexDigits[x % 16];
    }

    public static FromColor(c: number): LABColor {
        var rgb = LABColor.hexToRGB(c, 0);
        var r = LABColor.d3_rgb_xyz(rgb[0] * 255);
        var g = LABColor.d3_rgb_xyz(rgb[1] * 255);
        var b = LABColor.d3_rgb_xyz(rgb[2] * 255);

        var x = LABColor.d3_xyz_lab((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / LABColor.d3_lab_X);
        var y = LABColor.d3_xyz_lab((0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / LABColor.d3_lab_Y);
        var z = LABColor.d3_xyz_lab((0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / LABColor.d3_lab_Z);
        var lab = new LABColor(116 * y - 16, 500 * (x - y), 200 * (y - z));
        return lab;
    }

    private static d3_lab_X: number = 0.950470;
    private static d3_lab_Y: number = 1;
    private static d3_lab_Z: number = 1.088830;

    public static d3_lab_xyz(x: number): number {
        return x > 0.206893034 ? x * x * x : (x - 4 / 29) / 7.787037;
    }

    public static d3_xyz_rgb(r: number): number {
        return Math.round(255 * (r <= 0.00304 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - 0.055));
    }

    public static d3_rgb_xyz(r: number): number {
        return (r /= 255) <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    }

    public static d3_xyz_lab(x: number): number {
        return x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787037 * x + 4 / 29;
    }

    public static ToColor(lab: LABColor): number {
        var y = (lab.L + 16) / 116;
        var x = y + lab.A / 500;
        var z = y - lab.B / 200;
        x = LABColor.d3_lab_xyz(x) * LABColor.d3_lab_X;
        y = LABColor.d3_lab_xyz(y) * LABColor.d3_lab_Y;
        z = LABColor.d3_lab_xyz(z) * LABColor.d3_lab_Z;

        return LABColor.RGBtoHex(
            LABColor.d3_xyz_rgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z) / 255,
            LABColor.d3_xyz_rgb(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z) / 255,
            LABColor.d3_xyz_rgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z) / 255);
    }
}