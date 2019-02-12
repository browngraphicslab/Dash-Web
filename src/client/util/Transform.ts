export class Transform {
    private _translateX: number = 0;
    private _translateY: number = 0;
    private _scale: number = 1;

    static get Identity(): Transform {
        return new Transform(0, 0, 1);
    }

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

    translated = (x: number, y: number): Transform => {
        return this.copy().translate(x, y);
    }

    preTranslate = (x: number, y: number): Transform => {
        this._translateX += x * this._scale;
        this._translateY += y * this._scale;
        return this;
    }

    preTranslated = (x: number, y: number): Transform => {
        return this.copy().preTranslate(x, y);
    }

    scale = (scale: number): Transform => {
        this._scale *= scale;
        return this;
    }

    scaled = (scale: number): Transform => {
        return this.copy().scale(scale);
    }

    preScale = (scale: number): Transform => {
        this._scale *= scale;
        this._translateX *= scale;
        this._translateY *= scale;
        return this;
    }

    preScaled = (scale: number): Transform => {
        return this.copy().preScale(scale);
    }

    transform = (transform: Transform): Transform => {
        this._translateX += transform._translateX * this._scale;
        this._translateY += transform._translateY * this._scale;
        this._scale *= transform._scale;
        return this;
    }

    transformed = (transform: Transform): Transform => {
        return this.copy().transform(transform);
    }

    preTransform = (transform: Transform): Transform => {
        this._translateX = transform._translateX + this._translateX * transform._scale;
        this._translateY = transform._translateY + this._translateY * transform._scale;
        this._scale *= transform._scale;
        return this;
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

    inverse = () => {
        return new Transform(-this._translateX / this._scale, -this._translateY / this._scale, 1 / this._scale)
    }

    copy = () => {
        return new Transform(this._translateX, this._translateY, this._scale);
    }

}