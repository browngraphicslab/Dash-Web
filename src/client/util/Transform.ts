export class Transform {
    private _translateX: number = 0;
    private _translateY: number = 0;
    private _scale: number = 1;

    static get Identity(): Transform {
        return new Transform(0, 0, 1);
    }

    get TranslateX(): number { return this._translateX; }
    get TranslateY(): number { return this._translateY; }
    get Scale(): number { return this._scale; }

    constructor(x: number, y: number, scale: number) {
        this._translateX = x;
        this._translateY = y;
        this._scale = scale;
    }

    translate = (x: number, y: number): Transform => {
        this._translateX += x;
        this._translateY += y;
        return this;
    }

    scale = (scale: number): Transform => {
        this._scale *= scale;
        this._translateX *= scale;
        this._translateY *= scale;
        return this;
    }

    scaleAbout = (scale: number, x: number, y: number): Transform => {
        this._translateX += x * this._scale - x * this._scale * scale;
        this._translateY += y * this._scale - y * this._scale * scale;
        this._scale *= scale;
        return this;
    }

    transform = (transform: Transform): Transform => {
        this._translateX = transform._translateX + transform._scale * this._translateX;
        this._translateY = transform._translateY + transform._scale * this._translateY;
        this._scale *= transform._scale;
        return this;
    }

    preTranslate = (x: number, y: number): Transform => {
        this._translateX += this._scale * x;
        this._translateY += this._scale * y;
        return this;
    }

    preScale = (scale: number): Transform => {
        this._scale *= scale;
        return this;
    }

    preTransform = (transform: Transform): Transform => {
        this._translateX += transform._translateX * this._scale;
        this._translateY += transform._translateY * this._scale;
        this._scale *= transform._scale;
        return this;
    }

    translated = (x: number, y: number): Transform => {
        return this.copy().translate(x, y);
    }

    preTranslated = (x: number, y: number): Transform => {
        return this.copy().preTranslate(x, y);
    }

    scaled = (scale: number): Transform => {
        return this.copy().scale(scale);
    }

    scaledAbout = (scale: number, x: number, y: number): Transform => {
        return this.copy().scaleAbout(scale, x, y);
    }

    preScaled = (scale: number): Transform => {
        return this.copy().preScale(scale);
    }

    transformed = (transform: Transform): Transform => {
        return this.copy().transform(transform);
    }

    preTransformed = (transform: Transform): Transform => {
        return this.copy().preTransform(transform);
    }

    transformPoint = (x: number, y: number): [number, number] => {
        x *= this._scale;
        x += this._translateX;
        y *= this._scale;
        y += this._translateY;
        return [x, y];
    }

    transformDirection = (x: number, y: number): [number, number] => {
        return [x * this._scale, y * this._scale];
    }

    inverse = () => {
        return new Transform(-this._translateX / this._scale, -this._translateY / this._scale, 1 / this._scale)
    }

    copy = () => {
        return new Transform(this._translateX, this._translateY, this._scale);
    }

}