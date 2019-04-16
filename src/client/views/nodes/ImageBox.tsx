
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
import { ListField } from '../../../fields/ListField';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { TextField } from '../../../fields/TextField';
import { Document } from '../../../fields/Document';

@observer
export class ImageBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(ImageBox); }
    private _imgRef: React.RefObject<HTMLImageElement>;
    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;
    @observable private _photoIndex: number = 0;
    @observable private _isOpen: boolean = false;
    private dropDisposer?: DragManager.DragDropDisposer;

    constructor(props: FieldViewProps) {
        super(props);

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

    protected createDropTarget = (ele: HTMLDivElement) => {
        if (this.dropDisposer) {
            this.dropDisposer();
        }
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    componentWillUnmount() {
    }


    @undoBatch
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            de.data.droppedDocuments.map(action((drop: Document) => {
                let layout = drop.GetText(KeyStore.BackgroundLayout, "");
                if (layout.indexOf(ImageBox.name) !== -1) {
                    let imgData = this.props.Document.Get(KeyStore.Data);
                    if (imgData instanceof ImageField && imgData) {
                        this.props.Document.Set(KeyStore.Data, new ListField([imgData]));
                    }
                    let imgList = this.props.Document.GetList(KeyStore.Data, [] as any[]);
                    if (imgList) {
                        let field = drop.Get(KeyStore.Data);
                        if (field === FieldWaiting) { }
                        else if (field instanceof ImageField) imgList.push(field);
                        else if (field instanceof ListField) imgList.push(field.Data);
                    }
                    e.stopPropagation();
                }
            }))
            // de.data.removeDocument()  bcz: need to implement
        }
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

    lightbox = (images: string[]) => {
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
        let paths: string[] = ["http://www.cs.brown.edu/~bcz/face.gif"];
        if (field === FieldWaiting) paths = ["https://image.flaticon.com/icons/svg/66/66163.svg"];
        else if (field instanceof ImageField) paths = [field.Data.href];
        else if (field instanceof ListField) paths = field.Data.filter(val => val as ImageField).map(p => (p as ImageField).Data.href);
        let nativeWidth = this.props.Document.GetNumber(KeyStore.NativeWidth, 1);
        return (
            <div className="imageBox-cont" onPointerDown={this.onPointerDown} ref={this.createDropTarget} onContextMenu={this.specificContextMenu}>
                <img src={paths[0]} width={nativeWidth} alt="Image not found" ref={this._imgRef} onLoad={this.onLoad} />
                {this.lightbox(paths)}
            </div>);
    }
}