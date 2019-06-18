import { library } from '@fortawesome/fontawesome-svg-core';
import { faImage } from '@fortawesome/free-solid-svg-icons';
import { action, observable } from 'mobx';
import { observer } from "mobx-react";
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { Doc, HeightSym, WidthSym } from '../../../new_fields/Doc';
import { List } from '../../../new_fields/List';
import { createSchema, listSpec, makeInterface } from '../../../new_fields/Schema';
import { Cast, FieldValue, NumCast, StrCast } from '../../../new_fields/Types';
import { ImageField } from '../../../new_fields/URLField';
import { Utils } from '../../../Utils';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from "../../views/ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { DocComponent } from '../DocComponent';
import { InkingControl } from '../InkingControl';
import { positionSchema } from './DocumentView';
import { FieldView, FieldViewProps } from './FieldView';
import "./ImageBox.scss";
import React = require("react");
var path = require('path');


library.add(faImage);


export const pageSchema = createSchema({
    curPage: "number"
});

type ImageDocument = makeInterface<[typeof pageSchema, typeof positionSchema]>;
const ImageDocument = makeInterface(pageSchema, positionSchema);

@observer
export class ImageBox extends DocComponent<FieldViewProps, ImageDocument>(ImageDocument) {

    public static LayoutString() { return FieldView.LayoutString(ImageBox); }
    private _imgRef: React.RefObject<HTMLImageElement> = React.createRef();
    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;
    @observable private _photoIndex: number = 0;
    @observable private _isOpen: boolean = false;
    private dropDisposer?: DragManager.DragDropDisposer;



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
            de.data.droppedDocuments.forEach(action((drop: Doc) => {
                let layout = StrCast(drop.backgroundLayout);
                if (layout.indexOf(ImageBox.name) !== -1) {
                    let imgData = this.props.Document[this.props.fieldKey];
                    if (imgData instanceof ImageField) {
                        Doc.SetOnPrototype(this.props.Document, "data", new List([imgData]));
                    }
                    let imgList = Cast(this.props.Document[this.props.fieldKey], listSpec(ImageField), [] as any[]);
                    if (imgList) {
                        let field = drop.data;
                        if (field instanceof ImageField) imgList.push(field);
                        else if (field instanceof List) imgList.concat(field);
                    }
                    e.stopPropagation();
                }
            }));
            // de.data.removeDocument()  bcz: need to implement
        }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (e.shiftKey && e.ctrlKey) {
            e.stopPropagation(); // allows default system drag drop of images with shift+ctrl only
        } else e.preventDefault();
        // if (Date.now() - this._lastTap < 300) {
        //     if (e.buttons === 1) {
        //         this._downX = e.clientX;
        //         this._downY = e.clientY;
        //         document.removeEventListener("pointerup", this.onPointerUp);
        //         document.addEventListener("pointerup", this.onPointerUp);
        //     }
        // } else {
        //     this._lastTap = Date.now();
        // }
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
        let field = Cast(this.Document[this.props.fieldKey], ImageField);
        if (field) {
            let url = field.url.href;
            let subitems: ContextMenuProps[] = [];
            subitems.push({ description: "Copy path", event: () => Utils.CopyText(url), icon: "expand-arrows-alt" });
            subitems.push({
                description: "Rotate", event: action(() => {
                    let proto = Doc.GetProto(this.props.Document);
                    let nw = this.props.Document.nativeWidth;
                    let nh = this.props.Document.nativeHeight;
                    let w = this.props.Document.width;
                    let h = this.props.Document.height;
                    proto.rotation = (NumCast(this.props.Document.rotation) + 90) % 360;
                    proto.nativeWidth = nh;
                    proto.nativeHeight = nw;
                    this.props.Document.width = h;
                    this.props.Document.height = w;
                }), icon: "expand-arrows-alt"
            });
            ContextMenu.Instance.addItem({ description: "Image Funcs...", subitems: subitems });
        }
    }

    @action
    onDotDown(index: number) {
        this._photoIndex = index;
        this.Document.curPage = index;
    }

    dots(paths: string[]) {
        let nativeWidth = FieldValue(this.Document.nativeWidth, 1);
        let dist = Math.min(nativeWidth / paths.length, 40);
        let left = (nativeWidth - paths.length * dist) / 2;
        return paths.map((p, i) =>
            <div className="imageBox-placer" key={i} >
                <div className="imageBox-dot" style={{ background: (i === this._photoIndex ? "black" : "gray"), transform: `translate(${i * dist + left}px, 0px)` }} onPointerDown={(e: React.PointerEvent) => { e.stopPropagation(); this.onDotDown(i); }} />
            </div>
        );
    }

    choosePath(url: URL) {
        const lower = url.href.toLowerCase();
        if (url.protocol === "data" || url.href.indexOf(window.location.origin) === -1 || !(lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))) {
            return url.href;
        }
        let ext = path.extname(url.href);
        return url.href.replace(ext, this._curSuffix + ext);
    }

    @observable _smallRetryCount = 1;
    @observable _mediumRetryCount = 1;
    @observable _largeRetryCount = 1;
    @action retryPath = () => {
        if (this._curSuffix === "_s") this._smallRetryCount++;
        if (this._curSuffix === "_m") this._mediumRetryCount++;
        if (this._curSuffix === "_l") this._largeRetryCount++;
    }
    @action onError = () => {
        let timeout = this._curSuffix === "_s" ? this._smallRetryCount : this._curSuffix === "_m" ? this._mediumRetryCount : this._largeRetryCount;
        if (timeout < 10)
            setTimeout(this.retryPath, Math.min(10000, timeout * 5));
    }
    _curSuffix = "_m";
    render() {
        // let transform = this.props.ScreenToLocalTransform().inverse();
        let pw = typeof this.props.PanelWidth === "function" ? this.props.PanelWidth() : typeof this.props.PanelWidth === "number" ? (this.props.PanelWidth as any) as number : 50;
        // var [sptX, sptY] = transform.transformPoint(0, 0);
        // let [bptX, bptY] = transform.transformPoint(pw, this.props.PanelHeight());
        // let w = bptX - sptX;

        let id = (this.props as any).id; // bcz: used to set id = "isExpander" in templates.tsx
        let nativeWidth = FieldValue(this.Document.nativeWidth, pw);
        let nativeHeight = FieldValue(this.Document.nativeHeight, 0);
        let paths: string[] = ["http://www.cs.brown.edu/~bcz/noImage.png"];
        // this._curSuffix = "";
        // if (w > 20) {
        let field = this.Document[this.props.fieldKey];
        // if (w < 100 && this._smallRetryCount < 10) this._curSuffix = "_s";
        // else if (w < 600 && this._mediumRetryCount < 10) this._curSuffix = "_m";
        // else if (this._largeRetryCount < 10) this._curSuffix = "_l";
        if (field instanceof ImageField) paths = [this.choosePath(field.url)];
        else if (field instanceof List) paths = field.filter(val => val instanceof ImageField).map(p => this.choosePath((p as ImageField).url));
        // }
        let interactive = InkingControl.Instance.selectedTool ? "" : "-interactive";
        let rotation = NumCast(this.props.Document.rotation, 0);
        let aspect = (rotation % 180) ? this.props.Document[HeightSym]() / this.props.Document[WidthSym]() : 1;
        let shift = (rotation % 180) ? (nativeHeight - nativeWidth / aspect) / 2 : 0;
        return (
            <div id={id} className={`imageBox-cont${interactive}`}
                onPointerDown={this.onPointerDown}
                onDrop={this.onDrop} ref={this.createDropTarget} onContextMenu={this.specificContextMenu}>
                <img id={id}
                    key={this._smallRetryCount + (this._mediumRetryCount << 4) + (this._largeRetryCount << 8)} // force cache to update on retrys
                    src={paths[Math.min(paths.length, this._photoIndex)]}
                    style={{ transform: `translate(0px, ${shift}px) rotate(${rotation}deg) scale(${aspect})` }}
                    // style={{ objectFit: (this._photoIndex === 0 ? undefined : "contain") }}
                    width={nativeWidth}
                    ref={this._imgRef}
                    onError={this.onError} />
                {paths.length > 1 ? this.dots(paths) : (null)}
                {/* {this.lightbox(paths)} */}
            </div>);
    }
}