import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc } from '../../../fields/Doc';
import { collectionSchema, documentSchema } from '../../../fields/documentSchemas';
import { Id } from '../../../fields/FieldSymbols';
import { makeInterface } from '../../../fields/Schema';
import { ScriptField } from '../../../fields/ScriptField';
import { NumCast, ScriptCast, StrCast } from '../../../fields/Types';
import { OmitKeys, returnFalse, Utils } from '../../../Utils';
import { DragManager } from '../../util/DragManager';
import { DocumentView } from '../nodes/DocumentView';
import "./CollectionCarousel3DView.scss";
import { CollectionSubView } from './CollectionSubView';
import { StyleProp } from '../StyleProvider';

type Carousel3DDocument = makeInterface<[typeof documentSchema, typeof collectionSchema]>;
const Carousel3DDocument = makeInterface(documentSchema, collectionSchema);

@observer
export class CollectionCarousel3DView extends CollectionSubView(Carousel3DDocument) {
    @computed get scrollSpeed() {
        return this.layoutDoc._autoScrollSpeed ? NumCast(this.layoutDoc._autoScrollSpeed) : 1000; //default scroll speed
    }

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
    onChildDoubleClick = () => ScriptCast(this.layoutDoc.onChildDoubleClick);
    @computed get content() {
        const currentIndex = NumCast(this.layoutDoc._itemIndex);
        const displayDoc = (childPair: { layout: Doc, data: Doc }) => {
            return <DocumentView  {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "childLayoutTemplate", "childLayoutString"]).omit}
                onDoubleClick={this.onChildDoubleClick}
                renderDepth={this.props.renderDepth + 1}
                LayoutTemplate={this.props.childLayoutTemplate}
                LayoutTemplateString={this.props.childLayoutString}
                Document={childPair.layout}
                DataDoc={childPair.data}
                PanelWidth={this.panelWidth}
                PanelHeight={this.panelHeight}
                bringToFront={returnFalse}
            />;
        };

        return (this.childLayoutPairs.map((childPair, index) => {
            return (
                <div key={childPair.layout[Id]}
                    className={`collectionCarousel3DView-item${index === currentIndex ? "-active" : ""} ${index}`}
                    style={index === currentIndex ?
                        { opacity: '1', transform: 'scale(1.3)', width: this.panelWidth() } :
                        { opacity: '0.5', transform: 'scale(0.6)', userSelect: 'none', width: this.panelWidth() }}>
                    {displayDoc(childPair)}
                </div>);
        }));
    }

    changeSlide = (direction: number) => {
        this.layoutDoc._itemIndex = (NumCast(this.layoutDoc._itemIndex) + direction + this.childLayoutPairs.length) % this.childLayoutPairs.length;
    }

    onArrowClick = (e: React.MouseEvent, direction: number) => {
        e.stopPropagation();
        this.changeSlide(direction);
        !this.layoutDoc.autoScrollOn && (this.layoutDoc.showScrollButton = (direction === 1) ? "fwd" : "back"); // while autoscroll is on, keep the other autoscroll button hidden
        !this.layoutDoc.autoScrollOn && this.fadeScrollButton(); // keep pause button visible while autoscroll is on
    }

    interval?: number;
    startAutoScroll = (direction: number) => {
        this.interval = window.setInterval(() => {
            this.changeSlide(direction);
        }, this.scrollSpeed);
    }

    stopAutoScroll = () => {
        window.clearInterval(this.interval);
        this.interval = undefined;
        this.fadeScrollButton();
    }

    toggleAutoScroll = (direction: number) => {
        this.layoutDoc.autoScrollOn = this.layoutDoc.autoScrollOn ? false : true;
        this.layoutDoc.autoScrollOn ? this.startAutoScroll(direction) : this.stopAutoScroll();
    }

    fadeScrollButton = () => {
        window.setTimeout(() => {
            !this.layoutDoc.autoScrollOn && (this.layoutDoc.showScrollButton = "none"); //fade away after 1.5s if it's not clicked.
        }, 1500);
    }

    @computed get buttons() {
        if (!this.props.isContentActive()) return null;
        return <div className="arrow-buttons" >
            <div key="back" className="carousel3DView-back" style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }}
                onClick={(e) => this.onArrowClick(e, -1)}
            >
                <FontAwesomeIcon icon={"angle-left"} size={"2x"} />
            </div>
            <div key="fwd" className="carousel3DView-fwd" style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }}
                onClick={(e) => this.onArrowClick(e, 1)}
            >
                <FontAwesomeIcon icon={"angle-right"} size={"2x"} />
            </div>
            {this.autoScrollButton}
        </div>;
    }

    @computed get autoScrollButton() {
        const whichButton = this.layoutDoc.showScrollButton;
        return <>
            <div className={`carousel3DView-back-scroll${whichButton === "back" ? "" : "-hidden"}`} style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }}
                onClick={() => this.toggleAutoScroll(-1)}>
                {this.layoutDoc.autoScrollOn ? <FontAwesomeIcon icon={"pause"} size={"1x"} /> : <FontAwesomeIcon icon={"angle-double-left"} size={"1x"} />}
            </div>
            <div className={`carousel3DView-fwd-scroll${whichButton === "fwd" ? "" : "-hidden"}`} style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }}
                onClick={() => this.toggleAutoScroll(1)}>
                {this.layoutDoc.autoScrollOn ? <FontAwesomeIcon icon={"pause"} size={"1x"} /> : <FontAwesomeIcon icon={"angle-double-right"} size={"1x"} />}
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
        const translateX = this.panelWidth() * (1 - index);

        return <div className="collectionCarousel3DView-outer" ref={this.createDashEventsTarget}
            style={{
                background: this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BackgroundColor),
                color: this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.Color),
            }}  >
            <div className="carousel-wrapper" style={{ transform: `translateX(${translateX}px)` }}>
                {this.content}
            </div>
            {this.props.Document._chromeHidden ? (null) : this.buttons}
            <div className="dot-bar">
                {this.dots}
            </div>
        </div>;
    }
}