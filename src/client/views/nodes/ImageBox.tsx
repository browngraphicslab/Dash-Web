
import { action, observable } from 'mobx';
import { observer } from "mobx-react";
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { Document } from '../../../fields/Document';
import { FieldWaiting } from '../../../fields/Field';
import { ImageField } from '../../../fields/ImageField';
import { KeyStore } from '../../../fields/KeyStore';
import { ListField } from '../../../fields/ListField';
import { Utils } from '../../../Utils';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from "../../views/ContextMenu";
import { FieldView, FieldViewProps } from './FieldView';
import "./ImageBox.scss";
import React = require("react");
import { InkingControl } from '../InkingControl';
import { NumberField } from '../../../fields/NumberField';

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
    }

    @action
    onLoad = (target: any) => {
        var h = this._imgRef.current!.naturalHeight;
        var w = this._imgRef.current!.naturalWidth;
        if (this._photoIndex === 0) {
            this.props.Document.SetNumber(KeyStore.NativeHeight, this.props.Document.GetNumber(KeyStore.NativeWidth, 0) * h / w);
            this.props.Document.GetTAsync(KeyStore.Width, NumberField, field =>
                field && this.props.Document.SetNumber(KeyStore.Height, field.Data * h / w));
        }
    }


    protected createDropTarget = (ele: HTMLDivElement) => {
        if (this.dropDisposer) {
            this.dropDisposer();
        }
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }
    onDrop = (e: React.DragEvent) => {
        e.stopPropagation();
        e.preventDefault();
        console.log("IMPLEMENT ME PLEASE");
    }


    @undoBatch
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            de.data.droppedDocuments.map(action((drop: Document) => {
                let layout = drop.GetText(KeyStore.BackgroundLayout, "");
                if (layout.indexOf(ImageBox.name) !== -1) {
                    let imgData = this.props.Document.Get(KeyStore.Data);
                    if (imgData instanceof ImageField && imgData) {
                        this.props.Document.SetOnPrototype(KeyStore.Data, new ListField([imgData]));
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
            }));
            // de.data.removeDocument()  bcz: need to implement
        }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (Date.now() - this._lastTap < 300) {
            if (e.buttons === 1) {
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

    @action
    onDotDown(index: number) {
        this._photoIndex = index;
        this.props.Document.SetNumber(KeyStore.CurPage, index);
    }

    dots(paths: string[]) {
        let nativeWidth = this.props.Document.GetNumber(KeyStore.NativeWidth, 1);
        let dist = Math.min(nativeWidth / paths.length, 40);
        let left = (nativeWidth - paths.length * dist) / 2;
        return paths.map((p, i) =>
            <div className="imageBox-placer" key={i} >
                <div className="imageBox-dot" style={{ background: (i == this._photoIndex ? "black" : "gray"), transform: `translate(${i * dist + left}px, 0px)` }} onPointerDown={(e: React.PointerEvent) => { e.stopPropagation(); this.onDotDown(i); }} />
            </div>
        );
    }

    render() {
        let field = this.props.Document.Get(this.props.fieldKey);
        let paths: string[] = ["http://www.cs.brown.edu/~bcz/face.gif"];
        if (field === FieldWaiting) paths = ["https://image.flaticon.com/icons/svg/66/66163.svg"];
        else if (field instanceof ImageField) paths = [field.Data.href];
        else if (field instanceof ListField) paths = field.Data.filter(val => val as ImageField).map(p => (p as ImageField).Data.href);
        let nativeWidth = this.props.Document.GetNumber(KeyStore.NativeWidth, 1);
        let interactive = InkingControl.Instance.selectedTool ? "" : "-interactive";
        return (
            <div className={`imageBox-cont${interactive}`} onPointerDown={this.onPointerDown} onDrop={this.onDrop} ref={this.createDropTarget} onContextMenu={this.specificContextMenu}>
                <img src={paths[Math.min(paths.length, this._photoIndex)]} style={{ objectFit: (this._photoIndex === 0 ? undefined : "contain") }} width={nativeWidth} alt="Image not found" ref={this._imgRef} onLoad={this.onLoad} />
                {paths.length > 1 ? this.dots(paths) : (null)}
                {this.lightbox(paths)}
            </div>);
    }
}