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
import { ScriptField } from '../../../fields/ScriptField';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

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

    mainPanelWidth = () => this.props.PanelWidth() * 0.5;
    mainPanelHeight = () => this.props.PanelHeight() * 0.9;
    sidePanelWidth = () => this.props.PanelWidth() * 0.25;
    sidePanelHeight = () => this.props.PanelHeight() * 0.5;

    @computed get content() {
        const currentIndex = NumCast(this.layoutDoc._itemIndex);


        const displayDoc = (childPair: { layout: Doc, data: Doc }, width: () => number, height: () => number) => {
            const showCaptionScript = ScriptField.MakeScript(
                "child._showCaption = 'caption'",
                { child: Doc.name },
                { child: childPair.layout }
            );

            // const changeIndexScript = ScriptField.MakeScript(
            //     "collectionLayoutDoc._itemIndex = collectionLayoutDoc[fieldKey].indexOf(self)",
            //     { fieldKey: String.name, collectionLayoutDoc: Doc.name },
            //     { fieldKey: this.props.fieldKey, collectionLayoutDoc: this.layoutDoc }
            // );

            return <ContentFittingDocumentView {...this.props}
                onDoubleClick={ScriptCast(this.layoutDoc.onChildDoubleClick)}
                onClick={showCaptionScript}
                renderDepth={this.props.renderDepth + 1}
                LayoutTemplate={this.props.ChildLayoutTemplate}
                LayoutTemplateString={this.props.ChildLayoutString}
                Document={childPair.layout}
                DataDoc={childPair.data}
                PanelWidth={width}
                PanelHeight={height}
                ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                bringToFront={returnFalse}
                parentActive={this.props.active}
            />;
        };

        return (
            this.childLayoutPairs.map((child, index) => {
                if (index === currentIndex) {
                    return (
                        <div key={index} className={`collectionCarouselView-item ${index}`}
                            style={{ opacity: '1' }}>
                            {displayDoc(child, this.mainPanelWidth, this.mainPanelHeight)}
                        </div>);
                } else {
                    return (
                        <div key={index} className={`collectionCarouselView-item ${index}`}
                            style={{ opacity: '0.5', userSelect: 'none' }}>
                            {displayDoc(child, this.sidePanelWidth, this.sidePanelHeight)}
                        </div>);
                }
            }));
    }

    advance = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.layoutDoc._itemIndex = (NumCast(this.layoutDoc._itemIndex) + 1) % this.childLayoutPairs.length;
    }
    goback = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.layoutDoc._itemIndex = (NumCast(this.layoutDoc._itemIndex) - 1 + this.childLayoutPairs.length) % this.childLayoutPairs.length;
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
            <div key="back" className="carouselView-back" style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }} onClick={this.goback}>
                <FontAwesomeIcon icon={"caret-left"} size={"2x"} />
            </div>
            <div key="fwd" className="carouselView-fwd" style={{ background: `${StrCast(this.props.Document.backgroundColor)}` }} onClick={this.advance}>
                <FontAwesomeIcon icon={"caret-right"} size={"2x"} />
            </div>
        </>;
    }

    render() {
        const index = NumCast(this.layoutDoc._itemIndex);
        const offset = (index - 1) * (this.mainPanelWidth() - this.sidePanelWidth()) / this.childLayoutPairs.length;
        const translateX = (1 - index) / this.childLayoutPairs.length * 100;

        return <div className="collectionCarouselView-outer" onClick={this.onClick} onPointerDown={this.onPointerDown} ref={this.createDashEventsTarget} onContextMenu={this.onContextMenu}>
            <div className="carousel-wrapper" style={{ transform: `translateX(calc(${translateX}% + ${offset}px)` }}>
                {this.content}
            </div>
            {this.props.Document._chromeStatus !== "replaced" ? this.buttons : (null)}
        </div>;
    }
}