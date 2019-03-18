import { observable, computed, action } from "mobx";
import React = require("react");
import { SelectionManager } from "../util/SelectionManager";
import { observer } from "mobx-react";
import './DocumentDecorations.scss'
import { KeyStore } from '../../fields/KeyStore'
import { NumberField } from "../../fields/NumberField";
import { props } from "bluebird";
import { DragManager } from "../util/DragManager";
import { LinkMenu } from "./nodes/LinkMenu";
import { ListField } from "../../fields/ListField";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

@observer
export class DocumentDecorations extends React.Component {
    static Instance: DocumentDecorations
    private _resizer = ""
    private _isPointerDown = false;

    private _resizeBorderWidth = 16;
    private _linkButton = React.createRef<HTMLDivElement>();
    @observable private _hidden = false;

    constructor(props: Readonly<{}>) {
        super(props)

        DocumentDecorations.Instance = this
    }

    @computed
    get Bounds(): { x: number, y: number, b: number, r: number } {
        return SelectionManager.SelectedDocuments().reduce((bounds, documentView) => {
            if (documentView.props.isTopMost) {
                return bounds;
            }
            let transform = (documentView.props.ScreenToLocalTransform().scale(documentView.props.ContentScaling())).inverse();
            var [sptX, sptY] = transform.transformPoint(0, 0);
            let [bptX, bptY] = transform.transformPoint(documentView.props.PanelWidth(), documentView.props.PanelHeight());
            return {
                x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
                r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
            }
        }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: Number.MIN_VALUE, b: Number.MIN_VALUE });
    }


    @computed
    public get Hidden() { return this._hidden; }
    public set Hidden(value: boolean) { this._hidden = value; }

    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            this._isPointerDown = true;
            this._resizer = e.currentTarget.id;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }

    onLinkButtonDown = (e: React.PointerEvent): void => {
        // if ()
        // let linkMenu = new LinkMenu(SelectionManager.SelectedDocuments()[0]);
        // linkMenu.Hidden = false;
        console.log("down");

        e.stopPropagation();
        document.removeEventListener("pointermove", this.onLinkButtonMoved)
        document.addEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp)
        document.addEventListener("pointerup", this.onLinkButtonUp);

    }

    onLinkButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onLinkButtonMoved)
        document.removeEventListener("pointerup", this.onLinkButtonUp)
        e.stopPropagation();
    }


    onLinkButtonMoved = (e: PointerEvent): void => {
        if (this._linkButton.current != null) {
            document.removeEventListener("pointermove", this.onLinkButtonMoved)
            document.removeEventListener("pointerup", this.onLinkButtonUp)
            let dragData = new DragManager.LinkDragData(SelectionManager.SelectedDocuments()[0]);
            DragManager.StartLinkDrag(this._linkButton.current, dragData, {
                handlers: {
                    dragComplete: action(() => { }),
                },
                hideSource: false
            })
        }
        e.stopPropagation();
    }


    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        if (!this._isPointerDown) {
            return;
        }

        let dX = 0, dY = 0, dW = 0, dH = 0;

        switch (this._resizer) {
            case "":
                break;
            case "documentDecorations-topLeftResizer":
                dX = -1
                dY = -1
                dW = -(e.movementX)
                dH = -(e.movementY)
                break;
            case "documentDecorations-topRightResizer":
                dW = e.movementX
                dY = -1
                dH = -(e.movementY)
                break;
            case "documentDecorations-topResizer":
                dY = -1
                dH = -(e.movementY)
                break;
            case "documentDecorations-bottomLeftResizer":
                dX = -1
                dW = -(e.movementX)
                dH = e.movementY
                break;
            case "documentDecorations-bottomRightResizer":
                dW = e.movementX
                dH = e.movementY
                break;
            case "documentDecorations-bottomResizer":
                dH = e.movementY
                break;
            case "documentDecorations-leftResizer":
                dX = -1
                dW = -(e.movementX)
                break;
            case "documentDecorations-rightResizer":
                dW = e.movementX
                break;
        }

        SelectionManager.SelectedDocuments().forEach(element => {
            const rect = element.screenRect();
            if (rect.width !== 0) {
                let doc = element.props.Document;
                let width = doc.GetNumber(KeyStore.Width, 0);
                let nwidth = doc.GetNumber(KeyStore.NativeWidth, 0);
                let nheight = doc.GetNumber(KeyStore.NativeHeight, 0);
                let height = doc.GetNumber(KeyStore.Height, nwidth ? nheight / nwidth * width : 0);
                let x = doc.GetOrCreate(KeyStore.X, NumberField);
                let y = doc.GetOrCreate(KeyStore.Y, NumberField);
                let scale = width / rect.width;
                let actualdW = Math.max(width + (dW * scale), 20);
                let actualdH = Math.max(height + (dH * scale), 20);
                x.Data += dX * (actualdW - width);
                y.Data += dY * (actualdH - height);
                var nativeWidth = doc.GetNumber(KeyStore.NativeWidth, 0);
                var nativeHeight = doc.GetNumber(KeyStore.NativeHeight, 0);
                if (nativeWidth > 0 && nativeHeight > 0) {
                    if (Math.abs(dW) > Math.abs(dH))
                        actualdH = nativeHeight / nativeWidth * actualdW;
                    else actualdW = nativeWidth / nativeHeight * actualdH;
                }
                doc.SetNumber(KeyStore.Width, actualdW);
                doc.SetNumber(KeyStore.Height, actualdH);
            }
        })
    }

    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            e.preventDefault();
            this._isPointerDown = false;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
        }
    }

    changeFlyoutContent = (): void => {

    }
    // buttonOnPointerUp = (e: React.PointerEvent): void => {
    //     e.stopPropagation();
    // }

    render() {
        var bounds = this.Bounds;
        if (this.Hidden) {
            return (null);
        }
        if (isNaN(bounds.r) || isNaN(bounds.b) || isNaN(bounds.x) || isNaN(bounds.y)) {
            console.log("DocumentDecorations: Bounds Error")
            return (null);
        }

        let linkButton = null;
        if (SelectionManager.SelectedDocuments().length > 0) {
            let selFirst = SelectionManager.SelectedDocuments()[0];
            let linkToSize = selFirst.props.Document.GetData(KeyStore.LinkedToDocs, ListField, []).length;
            let linkFromSize = selFirst.props.Document.GetData(KeyStore.LinkedFromDocs, ListField, []).length;
            let linkCount = linkToSize + linkFromSize;
            linkButton = (<Flyout
                anchorPoint={anchorPoints.RIGHT_TOP}
                content={
                    <LinkMenu docView={selFirst} changeFlyout={this.changeFlyoutContent}>
                    </LinkMenu>
                }>
                <div className={"linkButton-" + (selFirst.props.Document.GetData(KeyStore.LinkedToDocs, ListField, []).length ? "nonempty" : "empty")} onPointerDown={this.onLinkButtonDown} >{linkCount}</div>
            </Flyout>);
        }
        return (
            <div id="documentDecorations-container" style={{
                width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                height: (bounds.b - bounds.y + this._resizeBorderWidth + 30) + "px",
                left: bounds.x - this._resizeBorderWidth / 2,
                top: bounds.y - this._resizeBorderWidth / 2,
            }}>
                <div id="documentDecorations-topLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-leftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-centerCont"></div>
                <div id="documentDecorations-rightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>

                <div title="View Links" className="linkFlyout" ref={this._linkButton}>{linkButton}</div>

            </div >
        )
    }
}