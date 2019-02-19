
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { SelectionManager } from "../../util/SelectionManager";
import "./ImageBox.scss";
import React = require("react")
import { ImageField } from '../../../fields/ImageField';
import { FieldViewProps, FieldView } from './FieldView';
import { CollectionFreeFormDocumentView } from './CollectionFreeFormDocumentView';
import { FieldWaiting } from '../../../fields/Field';
import { observer } from "mobx-react"
import { observable, action, spy } from 'mobx';
import { KeyStore } from '../../../fields/Key';
import { ContextMenu } from "../../views/ContextMenu";

@observer
export class ImageBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString("ImageBox"); }
    private _ref: React.RefObject<HTMLDivElement>;
    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;
    @observable private _photoIndex: number = 0;
    @observable private _isOpen: boolean = false;

    constructor(props: FieldViewProps) {
        super(props);

        this._ref = React.createRef();
        this.state = {
            photoIndex: 0,
            isOpen: false,
        };
    }

    componentDidMount() {
    }

    componentWillUnmount() {
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (Date.now() - this._lastTap < 300) {
            if (e.buttons === 1 && this.props.DocumentViewForField instanceof CollectionFreeFormDocumentView && SelectionManager.IsSelected(this.props.DocumentViewForField)) {
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
        const images = [path, "http://www.cs.brown.edu/~bcz/face.gif"];
        if (this._isOpen && this.props.DocumentViewForField instanceof CollectionFreeFormDocumentView && SelectionManager.IsSelected(this.props.DocumentViewForField)) {
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
            />)
        }
    }

    //REPLACE THIS WITH CAPABILITIES SPECIFC TO THIS TYPE OF NODE
    imageCapability = (e: React.MouseEvent): void => {
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        ContextMenu.Instance.addItem({ description: "Image Capability", event: this.imageCapability });
    }

    render() {
        let field = this.props.doc.Get(this.props.fieldKey);
        let path = field == FieldWaiting ? "https://image.flaticon.com/icons/svg/66/66163.svg" :
            field instanceof ImageField ? field.Data.href : "http://www.cs.brown.edu/~bcz/face.gif";

        return (
            <div className="imageBox-cont" onPointerDown={this.onPointerDown} ref={this._ref} onContextMenu={this.specificContextMenu}>
                <img src={path} width="100%" alt="Image not found" />
                {this.lightbox(path)}
            </div>)
    }
}