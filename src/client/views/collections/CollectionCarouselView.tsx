import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observable, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { documentSchema, collectionSchema } from '../../../fields/documentSchemas';
import { makeInterface } from '../../../fields/Schema';
import { NumCast, StrCast, ScriptCast, Cast } from '../../../fields/Types';
import { DragManager } from '../../util/DragManager';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import "./CollectionCarouselView.scss";
import { CollectionSubView } from './CollectionSubView';
import { Doc } from '../../../fields/Doc';
import { FormattedTextBox } from '../nodes/formattedText/FormattedTextBox';
import { ContextMenu } from '../ContextMenu';
import { ObjectField } from '../../../fields/ObjectField';
import { returnFalse, returnZero, OmitKeys } from '../../../Utils';
import { ScriptField } from '../../../fields/ScriptField';

type CarouselDocument = makeInterface<[typeof documentSchema, typeof collectionSchema]>;
const CarouselDocument = makeInterface(documentSchema, collectionSchema);

@observer
export class CollectionCarouselView extends CollectionSubView(CarouselDocument) {
    private _dropDisposer?: DragManager.DragDropDisposer;

    componentWillUnmount() { this._dropDisposer?.(); }

    protected createDashEventsTarget = (ele: HTMLDivElement) => { //used for stacking and masonry view
        this._dropDisposer?.();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, this.onInternalDrop.bind(this), this.layoutDoc);
        }
    }

    advance = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.layoutDoc._itemIndex = (NumCast(this.layoutDoc._itemIndex) + 1) % this.childLayoutPairs.length;
    }
    goback = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.layoutDoc._itemIndex = (NumCast(this.layoutDoc._itemIndex) - 1 + this.childLayoutPairs.length) % this.childLayoutPairs.length;
    }
    panelHeight = () => this.props.PanelHeight() - 50;
    onContentDoubleClick = () => ScriptCast(this.layoutDoc.onChildDoubleClick);
    onContentClick = () => ScriptCast(this.layoutDoc.onChildClick);
    @computed get content() {
        const index = NumCast(this.layoutDoc._itemIndex);
        const curDoc = this.childLayoutPairs?.[index];
        return !(curDoc?.layout instanceof Doc) ? (null) :
            <>
                <div className="collectionCarouselView-image" key="image">
                    <ContentFittingDocumentView  {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
                        onDoubleClick={this.onContentDoubleClick}
                        onClick={this.onContentClick}
                        renderDepth={this.props.renderDepth + 1}
                        LayoutTemplate={this.props.ChildLayoutTemplate}
                        LayoutTemplateString={this.props.ChildLayoutString}
                        Document={curDoc.layout}
                        DataDoc={curDoc.data}
                        PanelHeight={this.panelHeight}
                        ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                        bringToFront={returnFalse}
                        parentActive={this.props.active}
                    />
                </div>
                <div className="collectionCarouselView-caption" key="caption"
                    style={{
                        background: StrCast(this.layoutDoc._captionBackgroundColor, this.props.styleProvider?.(this.props.Document, this.props, "backgroundColor", this.props.layerProvider)),
                        color: StrCast(this.layoutDoc._captionColor, StrCast(this.layoutDoc.color)),
                        borderRadius: StrCast(this.layoutDoc._captionBorderRounding),
                    }}>
                    <FormattedTextBox key={index} {...this.props}
                        xMargin={NumCast(this.layoutDoc["_carousel-caption-xMargin"])}
                        yMargin={NumCast(this.layoutDoc["_carousel-caption-yMargin"])}
                        Document={curDoc.layout} DataDoc={undefined} fieldKey={"caption"} />
                </div>
            </>;
    }
    @computed get buttons() {
        return <>
            <div key="back" className="carouselView-back" style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }} onClick={this.goback}>
                <FontAwesomeIcon icon={"caret-left"} size={"2x"} />
            </div>
            <div key="fwd" className="carouselView-fwd" style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }} onClick={this.advance}>
                <FontAwesomeIcon icon={"caret-right"} size={"2x"} />
            </div>
        </>;
    }

    _downX = 0;
    _downY = 0;
    onPointerDown = (e: React.PointerEvent) => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        document.addEventListener("pointerup", this.onpointerup);
    }
    private _lastTap: number = 0;
    private _doubleTap = false;
    onpointerup = (e: PointerEvent) => {
        this._doubleTap = (Date.now() - this._lastTap < 300 && e.button === 0 && Math.abs(e.clientX - this._downX) < 2 && Math.abs(e.clientY - this._downY) < 2);
        this._lastTap = Date.now();
    }

    onClick = (e: React.MouseEvent) => {
        if (this._doubleTap) {
            e.stopPropagation();
            this.props.Document.isLightboxOpen = true;
        }
    }

    render() {
        return <div className="collectionCarouselView-outer" onClick={this.onClick} onPointerDown={this.onPointerDown} ref={this.createDashEventsTarget}>
            {this.content}
            {this.props.Document._chromeStatus !== "replaced" ? this.buttons : (null)}
        </div>;
    }
}