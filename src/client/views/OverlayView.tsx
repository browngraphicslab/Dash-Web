import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Doc, DocListCast, Opt } from "../../fields/Doc";
import { Id } from "../../fields/FieldSymbols";
import { NumCast, Cast } from "../../fields/Types";
import { emptyFunction, emptyPath, returnEmptyString, returnFalse, returnOne, returnTrue, returnZero, Utils, setupMoveUpEvents, returnEmptyFilter, returnEmptyDoclist } from "../../Utils";
import { Transform } from "../util/Transform";
import { CollectionFreeFormLinksView } from "./collections/collectionFreeForm/CollectionFreeFormLinksView";
import { DocumentView } from "./nodes/DocumentView";
import './OverlayView.scss';
import { Scripting } from "../util/Scripting";
import { ScriptingRepl } from './ScriptingRepl';
import { DragManager } from "../util/DragManager";
import { List } from "../../fields/List";

export type OverlayDisposer = () => void;

export type OverlayElementOptions = {
    x: number;
    y: number;
    width?: number;
    height?: number;
    title?: string;
};

export interface OverlayWindowProps {
    children: JSX.Element;
    overlayOptions: OverlayElementOptions;
    onClick: () => void;
}

@observer
export class OverlayWindow extends React.Component<OverlayWindowProps> {
    @observable x: number;
    @observable y: number;
    @observable width: number;
    @observable height: number;
    constructor(props: OverlayWindowProps) {
        super(props);

        const opts = props.overlayOptions;
        this.x = opts.x;
        this.y = opts.y;
        this.width = opts.width || 200;
        this.height = opts.height || 200;
    }

    onPointerDown = (_: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    onResizerPointerDown = (_: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.onResizerPointerMove);
        document.removeEventListener("pointerup", this.onResizerPointerUp);
        document.addEventListener("pointermove", this.onResizerPointerMove);
        document.addEventListener("pointerup", this.onResizerPointerUp);
    }

    @action
    onPointerMove = (e: PointerEvent) => {
        this.x += e.movementX;
        this.x = Math.max(Math.min(this.x, window.innerWidth - this.width), 0);
        this.y += e.movementY;
        this.y = Math.max(Math.min(this.y, window.innerHeight - this.height), 0);
    }

    @action
    onResizerPointerMove = (e: PointerEvent) => {
        this.width += e.movementX;
        this.width = Math.max(this.width, 30);
        this.height += e.movementY;
        this.height = Math.max(this.height, 30);
    }

    onPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    onResizerPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onResizerPointerMove);
        document.removeEventListener("pointerup", this.onResizerPointerUp);
    }

    render() {
        return (
            <div className="overlayWindow-outerDiv" style={{ transform: `translate(${this.x}px, ${this.y}px)`, width: this.width, height: this.height }}>
                <div className="overlayWindow-titleBar" onPointerDown={this.onPointerDown} >
                    {this.props.overlayOptions.title || "Untitled"}
                    <button onClick={this.props.onClick} className="overlayWindow-closeButton">X</button>
                </div>
                <div className="overlayWindow-content">
                    {this.props.children}
                </div>
                <div className="overlayWindow-resizeDragger" onPointerDown={this.onResizerPointerDown}></div>
            </div>
        );
    }
}

@observer
export class OverlayView extends React.Component {
    public static Instance: OverlayView;
    @observable.shallow
    private _elements: JSX.Element[] = [];

    constructor(props: any) {
        super(props);
        if (!OverlayView.Instance) {
            OverlayView.Instance = this;
        }
    }

    @action
    addElement(ele: JSX.Element, options: OverlayElementOptions): OverlayDisposer {
        const remove = action(() => {
            const index = this._elements.indexOf(ele);
            if (index !== -1) this._elements.splice(index, 1);
        });
        ele = <div key={Utils.GenerateGuid()} className="overlayView-wrapperDiv" style={{
            transform: `translate(${options.x}px, ${options.y}px)`,
            width: options.width,
            height: options.height,
            top: 0,
            left: 0
        }}>{ele}</div>;
        this._elements.push(ele);
        return remove;
    }

    @action
    addWindow(contents: JSX.Element, options: OverlayElementOptions): OverlayDisposer {
        const remove = action(() => {
            const index = this._elements.indexOf(contents);
            if (index !== -1) this._elements.splice(index, 1);
        });
        contents = <OverlayWindow onClick={remove} key={Utils.GenerateGuid()} overlayOptions={options}>{contents}</OverlayWindow>;
        this._elements.push(contents);
        return remove;
    }


    @computed get overlayDocs() {
        const userDocOverlays = Doc.UserDoc().myOverlayDocuments;
        if (!userDocOverlays) {
            return null;
        }
        return userDocOverlays instanceof Doc && DocListCast(userDocOverlays.data).map(d => {
            setTimeout(() => d.inOverlay = true, 0);
            let offsetx = 0, offsety = 0;
            const dref = React.createRef<HTMLDivElement>();
            const onPointerMove = action((e: PointerEvent, down: number[]) => {
                if (e.buttons === 1) {
                    d.x = e.clientX + offsetx;
                    d.y = e.clientY + offsety;
                }
                if (e.metaKey) {
                    const dragData = new DragManager.DocumentDragData([d]);
                    d.removeDropProperties = new List<string>(["inOverlay"]);
                    dragData.offset = [-offsetx, -offsety];
                    dragData.dropAction = "move";
                    dragData.removeDocument = (doc: Doc | Doc[]) => {
                        const docs = (doc instanceof Doc) ? [doc] : doc;
                        docs.forEach(d => Doc.RemoveDocFromList(Cast(Doc.UserDoc().myOverlayDocuments, Doc, null), "data", d));
                        return true;
                    };
                    dragData.moveDocument = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean): boolean => {
                        return dragData.removeDocument!(doc) ? addDocument(doc) : false;
                    };
                    DragManager.StartDocumentDrag([dref.current!], dragData, down[0], down[1]);
                    return true;
                }
                return false;
            });

            const onPointerDown = (e: React.PointerEvent) => {
                setupMoveUpEvents(this, e, onPointerMove, emptyFunction, emptyFunction);
                offsetx = NumCast(d.x) - e.clientX;
                offsety = NumCast(d.y) - e.clientY;
            };
            return <div className="overlayView-doc" ref={dref} key={d[Id]} onPointerDown={onPointerDown} style={{ top: d.type === 'presentation' ? 0 : undefined, width: NumCast(d._width), height: NumCast(d._height), transform: `translate(${d.x}px, ${d.y}px)` }}>
                <DocumentView
                    Document={d}
                    LibraryPath={emptyPath}
                    ChromeHeight={returnZero}
                    rootSelected={returnTrue}
                    bringToFront={emptyFunction}
                    addDocument={undefined}
                    removeDocument={undefined}
                    ContentScaling={returnOne}
                    NativeHeight={returnZero}
                    NativeWidth={returnZero}
                    PanelWidth={returnOne}
                    PanelHeight={returnOne}
                    ScreenToLocalTransform={Transform.Identity}
                    renderDepth={1}
                    parentActive={returnTrue}
                    whenActiveChanged={emptyFunction}
                    focus={emptyFunction}
                    backgroundColor={returnEmptyString}
                    addDocTab={returnFalse}
                    pinToPres={emptyFunction}
                    docFilters={returnEmptyFilter}
                    searchFilterDocs={returnEmptyDoclist}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined} />
            </div>;
        });
    }

    render() {
        return (
            <div className="overlayView" id="overlayView">
                <div>
                    {this._elements}
                </div>
                <CollectionFreeFormLinksView key="freeformLinks" />
                {this.overlayDocs}
            </div>
        );
    }
}
// bcz: ugh ... want to be able to pass ScriptingRepl as tag argument, but that doesn't seem to work.. runtime error
Scripting.addGlobal(function addOverlayWindow(type: string, options: OverlayElementOptions) {
    OverlayView.Instance.addWindow(<ScriptingRepl />, options);
});