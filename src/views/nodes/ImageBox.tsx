
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { SelectionManager } from "../../util/SelectionManager";
import { DocumentFieldViewProps } from "./DocumentView";
import "./ImageBox.scss";
import React = require("react")

interface ImageBoxState {
    photoIndex: number,
    isOpen: boolean,
};

export class ImageBox extends React.Component<DocumentFieldViewProps, ImageBoxState> {

    public static LayoutString() { return "<ImageBox doc={Document} containingDocumentView={ContainingDocumentView} fieldKey={DataKey} />"; }
    private _ref: React.RefObject<HTMLDivElement>;
    private _wasSelected: boolean = false;

    constructor(props: DocumentFieldViewProps) {
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

    _downX: number = 0;
    _downY: number = 0;
    _singleTap = false;
    _lastTap: number = 0;
    onPointerDown = (e: React.PointerEvent): void => {
        const { containingDocumentView } = this.props;
        if (Date.now() - this._lastTap < 300) {
            if (e.buttons === 1 && SelectionManager.IsSelected(containingDocumentView)) {
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

    render() {
        const images = [this.props.doc.GetTextField(this.props.fieldKey, ""),];
        var lightbox = () => {
            const { photoIndex } = this.state;
            if (this.state.isOpen && SelectionManager.IsSelected(this.props.containingDocumentView)) {
                return (<Lightbox
                    mainSrc={images[photoIndex]}
                    nextSrc={photoIndex + 1 < images.length ? images[(photoIndex + 1) % images.length] : undefined}
                    prevSrc={photoIndex - 1 > 0 ? images[(photoIndex + images.length - 1) % images.length] : undefined}
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
        return (
            <div className="imageBox-cont" onPointerDown={this.onPointerDown} ref={this._ref} >
                <img src={images[0]} width="100%" alt="Image not found" />
                {lightbox()}
            </div>)
    }
}