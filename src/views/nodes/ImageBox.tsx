
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { SelectionManager } from "../../util/SelectionManager";
import "./ImageBox.scss";
import React = require("react")
import { ImageField } from '../../fields/ImageField';
import { FieldViewProps, FieldView } from './FieldView';
import { CollectionFreeFormDocumentView } from './CollectionFreeFormDocumentView';
import { WAITING } from '../../fields/Field';
import { Key, KeyStore } from '../../fields/Key';

interface ImageBoxState {
    photoIndex: number,
    isOpen: boolean,
};

export class ImageBox extends React.Component<FieldViewProps, ImageBoxState> {

    public static LayoutString() { return FieldView.LayoutString("ImageBox DataVal={Data} "); }
    private _ref: React.RefObject<HTMLDivElement>;
    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;

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
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointerup", this.onPointerUp);
        if (Math.abs(e.clientX - this._downX) < 2 && Math.abs(e.clientY - this._downY) < 2) {
            this.setState({ isOpen: true })
        }
        e.stopPropagation();
    }

    lightbox = (path: string) => {
        const images = [path, "http://www.cs.brown.edu/~bcz/face.gif"];
        const { photoIndex } = this.state;
        if (this.state.isOpen && this.props.DocumentViewForField instanceof CollectionFreeFormDocumentView && SelectionManager.IsSelected(this.props.DocumentViewForField)) {
            return (<Lightbox
                mainSrc={images[photoIndex]}
                nextSrc={images[(photoIndex + 1) % images.length]}
                prevSrc={images[(photoIndex + images.length - 1) % images.length]}
                onCloseRequest={() => this.setState({ isOpen: false })}
                onMovePrevRequest={() =>
                    this.setState({ photoIndex: (photoIndex + images.length - 1) % images.length, })
                }
                onMoveNextRequest={() =>
                    this.setState({ photoIndex: (photoIndex + 1) % images.length, })
                }
            />)
        }
    }

    render() {

        // bcz: use LayoutFields (here) or LayoutKeys (below)?
        // let field = (this.props as any).DataVal;//this.props.doc.GetFieldT(this.props.fieldKey, ImageField);
        // let path = field == WAITING ? "https://image.flaticon.com/icons/svg/66/66163.svg" :
        //     field instanceof URL ? field.href : "";

        let field = this.props.doc.GetFieldT(this.props.fieldKey, ImageField);
        let path = field == WAITING ? "https://image.flaticon.com/icons/svg/66/66163.svg" :
            field instanceof ImageField ? field.Data.href : "";
        console.log("ImageBox Rendering " + this.props.doc.Title);

        return (
            <div className="imageBox-cont" onPointerDown={this.onPointerDown} ref={this._ref} >
                <img src={path} width="100%" alt="Image not found" />
                {this.lightbox(path)}
            </div>)
    }
}