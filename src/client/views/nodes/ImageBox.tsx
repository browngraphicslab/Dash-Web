
import { action, observable, trace } from 'mobx';
import { observer } from "mobx-react";
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { FieldWaiting } from '../../../fields/Field';
import { ImageField } from '../../../fields/ImageField';
import { KeyStore } from '../../../fields/KeyStore';
import { ContextMenu } from "../../views/ContextMenu";
import { FieldView, FieldViewProps } from './FieldView';
import "./ImageBox.scss";
import React = require("react");
import { Utils } from '../../../Utils';

@observer
export class ImageBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(ImageBox); }
    private _ref: React.RefObject<HTMLDivElement>;
    private _imgRef: React.RefObject<HTMLImageElement>;
    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;
    @observable private _photoIndex: number = 0;
    @observable private _isOpen: boolean = false;

    constructor(props: FieldViewProps) {
        super(props);

        this._ref = React.createRef();
        this._imgRef = React.createRef();
        this.state = {
            photoIndex: 0,
            isOpen: false,
        };
    }

    @action
    onLoad = (target: any) => {
        var h = this._imgRef.current!.naturalHeight;
        var w = this._imgRef.current!.naturalWidth;
        this.props.Document.SetNumber(KeyStore.NativeHeight, this.props.Document.GetNumber(KeyStore.NativeWidth, 0) * h / w);
    }

    componentDidMount() {
    }

    componentWillUnmount() {
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (Date.now() - this._lastTap < 300) {
            if (e.buttons === 1) {
                e.stopPropagation();
                this._downX = e.clientX;
                this._downY = e.clientY;
                document.removeEventListener("pointerup", this.onPointerUp);
                document.addEventListener("pointerup", this.onPointerUp);
            }
        } else {
            this._lastTap = Date.now();
        }
    }
    @action
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointerup", this.onPointerUp);
        if (Math.abs(e.clientX - this._downX) < 2 && Math.abs(e.clientY - this._downY) < 2) {
            this._isOpen = true;
        }
        e.stopPropagation();
    }

    lightbox = (path: string) => {
        const images = [path];
        if (this._isOpen) {
            return (<Lightbox
                mainSrc={images[this._photoIndex]}
                nextSrc={images[(this._photoIndex + 1) % images.length]}
                prevSrc={images[(this._photoIndex + images.length - 1) % images.length]}
                onCloseRequest={action(() =>
                    this._isOpen = false
                )}
                onMovePrevRequest={action(() =>
                    this._photoIndex = (this._photoIndex + images.length - 1) % images.length
                )}
                onMoveNextRequest={action(() =>
                    this._photoIndex = (this._photoIndex + 1) % images.length
                )}
            />);
        }
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        let field = this.props.Document.GetT(this.props.fieldKey, ImageField);
        if (field && field !== FieldWaiting) {
            let url = field.Data.href;
            ContextMenu.Instance.addItem({
                description: "Copy path", event: () => {
                    Utils.CopyText(url);
                }
            });
        }
    }

    render() {
        let field = this.props.Document.Get(this.props.fieldKey);
        let path = field === FieldWaiting ? "https://image.flaticon.com/icons/svg/66/66163.svg" :
            field instanceof ImageField ? field.Data.href : "http://www.cs.brown.edu/~bcz/face.gif";
        let nativeWidth = this.props.Document.GetNumber(KeyStore.NativeWidth, 1);
        return (
            <div className="imageBox-cont" onPointerDown={this.onPointerDown} ref={this._ref} onContextMenu={this.specificContextMenu}>
                <img src={path} width={nativeWidth} alt="Image not found" ref={this._imgRef} onLoad={this.onLoad} />
                {this.lightbox(path)}
            </div>);
    }
}