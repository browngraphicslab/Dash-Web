import { observable, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { documentSchema, collectionSchema } from '../../../fields/documentSchemas';
import { makeInterface } from '../../../fields/Schema';
import { NumCast, StrCast, ScriptCast, Cast } from '../../../fields/Types';
import { DragManager } from '../../util/DragManager';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import "./CollectionCarousel3DView.scss";
import { CollectionSubView } from './CollectionSubView';
import { Doc } from '../../../fields/Doc';
import { ContextMenu } from '../ContextMenu';
import { ObjectField } from '../../../fields/ObjectField';
import { returnFalse, Utils } from '../../../Utils';
import { ScriptField } from '../../../fields/ScriptField';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Id } from '../../../fields/FieldSymbols';

type Carousel3DDocument = makeInterface<[typeof documentSchema, typeof collectionSchema]>;
const Carousel3DDocument = makeInterface(documentSchema, collectionSchema);

@observer
export class CollectionCarousel3DView extends CollectionSubView(Carousel3DDocument) {
    private _dropDisposer?: DragManager.DragDropDisposer;

    componentWillUnmount() { this._dropDisposer?.(); }

    protected createDashEventsTarget = (ele: HTMLDivElement) => { //used for stacking and masonry view
        this._dropDisposer?.();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, this.onInternalDrop.bind(this), this.layoutDoc);
        }
    }

    panelWidth = () => this.props.PanelWidth() / 3;
    panelHeight = () => this.props.PanelHeight() * 0.6;
    @computed get content() {
        const currentIndex = NumCast(this.layoutDoc._itemIndex);
        const displayDoc = (childPair: { layout: Doc, data: Doc }) => {
            return <ContentFittingDocumentView {...this.props}
                onDoubleClick={ScriptCast(this.layoutDoc.onChildDoubleClick)}
                onClick={ScriptField.MakeScript(
                    "child._showCaption = 'caption'",
                    { child: Doc.name },
                    { child: childPair.layout }
                )}
                renderDepth={this.props.renderDepth + 1}
                LayoutTemplate={this.props.ChildLayoutTemplate}
                LayoutTemplateString={this.props.ChildLayoutString}
                Document={childPair.layout}
                DataDoc={childPair.data}
                PanelWidth={this.panelWidth}
                PanelHeight={this.panelHeight}
                ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                bringToFront={returnFalse}
                parentActive={this.props.active}
            />;
        };

        return (
            this.childLayoutPairs.map((childPair, index) => {
                return (
                    <div key={childPair.layout[Id]}
                        className={`collectionCarousel3DView-item${index === currentIndex ? "-active" : ""} ${index}`}
                        style={index === currentIndex ?
                            { opacity: '1', transform: 'scale(1.3)' } :
                            { opacity: '0.5', transform: 'scale(0.6)', userSelect: 'none' }}>
                        {displayDoc(childPair)}
                    </div>);
            }));
    }

    changeSlide = (direction: number) => {
        this.layoutDoc._itemIndex = (NumCast(this.layoutDoc._itemIndex) + direction + this.childLayoutPairs.length) % this.childLayoutPairs.length;
    }

    startScroll = (direction: number) => {
        this.layoutDoc.scrollInterval = 500;
        this.interval = window.setInterval(() => {
            this.changeSlide(direction);
        }, this.layoutDoc.scrollInterval);
    }

    timer?: number;
    interval?: number;
    onArrowDown = (e: React.PointerEvent, direction: number) => {
        e.stopPropagation;

        const listener = () => { // is able to pass in the direction parameter and then correctly remove the listener
            this.onArrowRelease(direction);
            document.removeEventListener("pointerup", listener);
        };
        document.addEventListener("pointerup", listener);

        this.layoutDoc.startScrollTimeout = 500;
        this.timer = window.setTimeout(() => { // if arrow is held down long enough, activate automatic scrolling
            window.clearTimeout(this.timer);
            this.timer = undefined;
            this.startScroll(direction);
        }, this.layoutDoc.startScrollTimeout);
    }

    onArrowRelease = (direction: number) => {
        if (this.timer) {
            this.changeSlide(direction); // if click wasn't long enough to activate autoscroll, only advance/go back 1 slide
            window.clearTimeout(this.timer);
            this.timer = undefined;
        }

        if (this.interval) {
            window.clearInterval(this.interval); // stop scrolling
            this.interval = undefined;
        }
    }

    onContextMenu = (e: React.MouseEvent): void => {
        // need to test if propagation has stopped because GoldenLayout forces a parallel react hierarchy to be created for its top-level layout
        if (!e.isPropagationStopped()) {
            ContextMenu.Instance.addItem({
                description: "Make Hero Image", event: () => {
                    const index = NumCast(this.layoutDoc._itemIndex);
                    (this.dataDoc || Doc.GetProto(this.props.Document)).hero = ObjectField.MakeCopy(this.childLayoutPairs[index].layout.data as ObjectField);
                }, icon: "plus"
            });
        }
    }
    _downX = 0;
    _downY = 0;
    onPointerDown = (e: React.PointerEvent) => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        console.log("CAROUSEL down");
        document.addEventListener("pointerup", this.onpointerup);
    }
    private _lastTap: number = 0;
    private _doubleTap = false;
    onpointerup = (e: PointerEvent) => {
        console.log("CAROUSEL up");
        this._doubleTap = (Date.now() - this._lastTap < 300 && e.button === 0 && Math.abs(e.clientX - this._downX) < 2 && Math.abs(e.clientY - this._downY) < 2);
        this._lastTap = Date.now();
    }

    onClick = (e: React.MouseEvent) => {
        if (this._doubleTap) {
            e.stopPropagation();
            this.props.Document.isLightboxOpen = true;
        }
    }

    @computed get buttons() {
        return <>
            <div key="back" className="carouselView-back" style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }}
                onPointerDown={(e) => this.onArrowDown(e, -1)}>
                <FontAwesomeIcon icon={"caret-left"} size={"2x"} />
            </div>
            <div key="fwd" className="carouselView-fwd" style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }}
                onPointerDown={(e) => this.onArrowDown(e, 1)}>
                <FontAwesomeIcon icon={"caret-right"} size={"2x"} />
            </div>
        </>;
    }

    @computed get dots() {
        return (this.childLayoutPairs.map((_child, index) => {
            return <div key={Utils.GenerateGuid()} className={`dot${index === NumCast(this.layoutDoc._itemIndex) ? "-active" : ""}`}
                onClick={() => this.layoutDoc._itemIndex = index} />;
        }));
    }

    render() {
        const index = NumCast(this.layoutDoc._itemIndex);
        const translateX = (1 - index) / this.childLayoutPairs.length * 100;

        return <div className="collectionCarousel3DView-outer" onClick={this.onClick} onPointerDown={this.onPointerDown} ref={this.createDashEventsTarget} onContextMenu={this.onContextMenu}>
            <div className="carousel-wrapper" style={{ transform: `translateX(calc(${translateX}%` }}>
                {this.content}
            </div>
            {this.props.Document._chromeStatus !== "replaced" ? this.buttons : (null)}
            <div className="dot-bar">
                {this.dots}
            </div>
        </div>;
    }
}