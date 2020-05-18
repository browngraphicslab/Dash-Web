import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
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
import { returnFalse } from '../../../Utils';

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

    advance = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.layoutDoc._itemIndex = (NumCast(this.layoutDoc._itemIndex) + 1) % this.childLayoutPairs.length;
    }

    goback = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.layoutDoc._itemIndex = (NumCast(this.layoutDoc._itemIndex) - 1 + this.childLayoutPairs.length) % this.childLayoutPairs.length;
    }

    @computed get content() {
        const index = NumCast(this.layoutDoc._itemIndex);
        const prevIndex = (index - 1 + this.childLayoutPairs.length) % this.childLayoutPairs.length;
        const nextIndex = (index + 1 + this.childLayoutPairs.length) % this.childLayoutPairs.length;
        return !(this.childLayoutPairs?.[index]?.layout instanceof Doc) ? (null) :
            <>
                <div className="collectionCarouselView-prev">
                    <ContentFittingDocumentView {...this.props}
                        onDoubleClick={ScriptCast(this.layoutDoc.onChildDoubleClick)}
                        onClick={ScriptCast(this.layoutDoc.onChildClick)}
                        renderDepth={this.props.renderDepth + 1}
                        LayoutTemplate={this.props.ChildLayoutTemplate}
                        LayoutTemplateString={this.props.ChildLayoutString}
                        Document={this.childLayoutPairs[prevIndex].layout}
                        DataDoc={this.childLayoutPairs[prevIndex].data}
                        PanelHeight={this.props.PanelHeight}
                        ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                        bringToFront={returnFalse}
                        parentActive={this.props.active}
                    />
                </div>
                <div className="collectionCarouselView-next">
                    <ContentFittingDocumentView {...this.props}
                        onDoubleClick={ScriptCast(this.layoutDoc.onChildDoubleClick)}
                        onClick={ScriptCast(this.layoutDoc.onChildClick)}
                        renderDepth={this.props.renderDepth + 1}
                        LayoutTemplate={this.props.ChildLayoutTemplate}
                        LayoutTemplateString={this.props.ChildLayoutString}
                        Document={this.childLayoutPairs[nextIndex].layout}
                        DataDoc={this.childLayoutPairs[nextIndex].data}
                        PanelHeight={this.props.PanelHeight}
                        ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                        bringToFront={returnFalse}
                        parentActive={this.props.active}
                    />
                </div>
                <div className="collectionCarouselView-image" key="image">
                    <ContentFittingDocumentView {...this.props}
                        onDoubleClick={ScriptCast(this.layoutDoc.onChildDoubleClick)}
                        onClick={ScriptCast(this.layoutDoc.onChildClick)}
                        renderDepth={this.props.renderDepth + 1}
                        LayoutTemplate={this.props.ChildLayoutTemplate}
                        LayoutTemplateString={this.props.ChildLayoutString}
                        Document={this.childLayoutPairs[index].layout}
                        DataDoc={this.childLayoutPairs[index].data}
                        PanelHeight={this.props.PanelHeight}
                        ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                        bringToFront={returnFalse}
                        parentActive={this.props.active}
                    />
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

    render() {
        return <div className="collectionCarouselView-outer" onClick={this.onClick} onPointerDown={this.onPointerDown} ref={this.createDashEventsTarget} onContextMenu={this.onContextMenu}>
            {this.content}
            {this.props.Document._chromeStatus !== "replaced" ? this.buttons : (null)}
        </div>;
    }
}