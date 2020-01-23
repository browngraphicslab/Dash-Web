import * as React from "react";
import { observer } from "mobx-react";
import { observable, action, trace, computed } from "mobx";
import { Utils, emptyFunction, returnOne, returnTrue, returnEmptyString, returnZero, returnFalse, emptyPath } from "../../Utils";

import './OverlayView.scss';
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import { DocListCast, Doc } from "../../new_fields/Doc";
import { Id } from "../../new_fields/FieldSymbols";
import { DocumentView } from "./nodes/DocumentView";
import { Transform } from "../util/Transform";
import { NumCast } from "../../new_fields/Types";
import { CollectionFreeFormLinksView } from "./collections/collectionFreeForm/CollectionFreeFormLinksView";

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
            height: options.height
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
        if (!CurrentUserUtils.UserDocument) {
            return (null);
        }
        return CurrentUserUtils.UserDocument.overlays instanceof Doc && DocListCast(CurrentUserUtils.UserDocument.overlays.data).map(d => {
            d.inOverlay = true;
            let offsetx = 0, offsety = 0;
            const onPointerMove = action((e: PointerEvent) => {
                if (e.buttons === 1) {
                    d.x = e.clientX + offsetx;
                    d.y = e.clientY + offsety;
                    e.stopPropagation();
                    e.preventDefault();
                }
            });
            const onPointerUp = action((e: PointerEvent) => {
                document.removeEventListener("pointermove", onPointerMove);
                document.removeEventListener("pointerup", onPointerUp);
                e.stopPropagation();
                e.preventDefault();
            });

            const onPointerDown = (e: React.PointerEvent) => {
                offsetx = NumCast(d.x) - e.clientX;
                offsety = NumCast(d.y) - e.clientY;
                e.stopPropagation();
                e.preventDefault();
                document.addEventListener("pointermove", onPointerMove);
                document.addEventListener("pointerup", onPointerUp);
            };
            return <div className="overlayView-doc" key={d[Id]} onPointerDown={onPointerDown} style={{ transform: `translate(${d.x}px, ${d.y}px)`, display: d.isMinimized ? "none" : "" }}>
                <DocumentView
                    Document={d}
                    LibraryPath={emptyPath}
                    ChromeHeight={returnZero}
                    // isSelected={returnFalse}
                    // select={emptyFunction}
                    // layoutKey={"layout"}
                    bringToFront={emptyFunction}
                    addDocument={undefined}
                    removeDocument={undefined}
                    ContentScaling={returnOne}
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
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    zoomToScale={emptyFunction}
                    getScale={returnOne} />
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