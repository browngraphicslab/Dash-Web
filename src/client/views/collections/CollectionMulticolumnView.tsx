import { observer } from 'mobx-react';
import { makeInterface } from '../../../new_fields/Schema';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { CollectionSubView, SubCollectionViewProps } from './CollectionSubView';
import * as React from "react";
import { Doc } from '../../../new_fields/Doc';
import { NumCast, StrCast, BoolCast } from '../../../new_fields/Types';
import { ContentFittingDocumentView } from './../nodes/ContentFittingDocumentView';
import { Utils } from '../../../Utils';
import "./collectionMulticolumnView.scss";
import { computed, trace, observable, action } from 'mobx';
import { Transform } from '../../util/Transform';

type MulticolumnDocument = makeInterface<[typeof documentSchema]>;
const MulticolumnDocument = makeInterface(documentSchema);

interface Unresolved {
    target: Doc;
    magnitude: number;
    unit: string;
}

interface LayoutData {
    unresolved: Unresolved[];
    numFixed: number;
    numRatio: number;
    starSum: number;
}

const resolvedUnits = ["*", "px"];
const resizerWidth = 4;
const resizerOpacity = 1;

@observer
export class CollectionMulticolumnView extends CollectionSubView(MulticolumnDocument) {

    @computed
    private get ratioDefinedDocs() {
        return this.childLayoutPairs.map(({ layout }) => layout).filter(({ widthUnit }) => StrCast(widthUnit) === "*");
    }

    @computed
    private get resolvedLayoutInformation(): LayoutData {
        const unresolved: Unresolved[] = [];
        let starSum = 0, numFixed = 0, numRatio = 0;

        for (const { layout } of this.childLayoutPairs) {
            const unit = StrCast(layout.widthUnit);
            const magnitude = NumCast(layout.widthMagnitude);
            if (unit && magnitude && magnitude > 0 && resolvedUnits.includes(unit)) {
                if (unit === "*") {
                    starSum += magnitude;
                    numRatio++;
                } else {
                    numFixed++;
                }
                unresolved.push({ target: layout, magnitude, unit });
            }
            // otherwise, the particular configuration entry is ignored and the remaining
            // space is allocated as if the document were absent from the configuration list
        }


        setTimeout(() => {
            const { ratioDefinedDocs } = this;
            if (ratioDefinedDocs.length > 1) {
                const minimum = Math.min(...ratioDefinedDocs.map(({ widthMagnitude }) => NumCast(widthMagnitude)));
                ratioDefinedDocs.forEach(layout => layout.widthMagnitude = NumCast(layout.widthMagnitude) / minimum);
            }
        });

        return { unresolved, numRatio, numFixed, starSum };
    }

    /**
     * This returns the total quantity, in pixels, that this
     * view needs to reserve for child documents that have
     * (with higher priority) requested a fixed pixel width.
     * 
     * If the underlying resolvedLayoutInformation returns null
     * because we're waiting on promises to resolve, this value will be undefined as well.
     */
    @computed
    private get totalFixedAllocation(): number | undefined {
        return this.resolvedLayoutInformation?.unresolved.reduce(
            (sum, { magnitude, unit }) => sum + (unit === "px" ? magnitude : 0), 0);
    }

    /**
     * This returns the total quantity, in pixels, that this
     * view needs to reserve for child documents that have
     * (with lower priority) requested a certain relative proportion of the
     * remaining pixel width not allocated for fixed widths.
     * 
     * If the underlying totalFixedAllocation returns undefined
     * because we're waiting indirectly on promises to resolve, this value will be undefined as well.
     */
    @computed
    private get totalRatioAllocation(): number | undefined {
        const layoutInfoLen = this.resolvedLayoutInformation?.unresolved.length;
        if (layoutInfoLen > 0 && this.totalFixedAllocation !== undefined) {
            return this.props.PanelWidth() - (this.totalFixedAllocation + resizerWidth * (layoutInfoLen - 1));
        }
    }

    /**
     * This returns the total quantity, in pixels, that
     * 1* (relative / star unit) is worth. For example,
     * if the configuration has three documents, with, respectively,
     * widths of 2*, 2* and 1*, and the panel width returns 1000px,
     * this accessor returns 1000 / (2 + 2 + 1), or 200px.
     * Elsewhere, this is then multiplied by each relative-width
     * document's (potentially decimal) * count to compute its actual width (400px, 400px and 200px).
     * 
     * If the underlying totalRatioAllocation or this.resolveLayoutInformation return undefined
     * because we're waiting indirectly on promises to resolve, this value will be undefined as well.
     */
    @computed
    private get columnUnitLength(): number | undefined {
        if (this.resolvedLayoutInformation && this.totalRatioAllocation !== undefined) {
            return this.totalRatioAllocation / this.resolvedLayoutInformation.starSum;
        }
    }

    private getColumnUnitLength = () => this.columnUnitLength;

    private lookupPixels = (layout: Doc): number => {
        const columnUnitLength = this.columnUnitLength;
        if (columnUnitLength === undefined) {
            return 0; // we're still waiting on promises to resolve
        }
        let width = NumCast(layout.widthMagnitude);
        if (StrCast(layout.widthUnit) === "*") {
            width *= columnUnitLength;
        }
        return width;
    }

    private lookupIndividualTransform = (layout: Doc) => {
        const columnUnitLength = this.columnUnitLength;
        if (columnUnitLength === undefined) {
            return Transform.Identity(); // we're still waiting on promises to resolve
        }
        let offset = 0;
        for (const { layout: candidate } of this.childLayoutPairs) {
            if (candidate === layout) {
                const shift = offset;
                return this.props.ScreenToLocalTransform().translate(-shift, 0);
            }
            offset += this.lookupPixels(candidate) + resizerWidth;
        }
        return Transform.Identity(); // type coersion, this case should never be hit
    }

    @computed
    private get contents(): JSX.Element[] | null {
        trace();
        const { childLayoutPairs } = this;
        const { Document, PanelHeight } = this.props;
        const collector: JSX.Element[] = [];
        for (let i = 0; i < childLayoutPairs.length; i++) {
            const { layout } = childLayoutPairs[i];
            collector.push(
                <div className={"document-wrapper"}>
                    <ContentFittingDocumentView
                        {...this.props}
                        key={Utils.GenerateGuid()}
                        Document={layout}
                        DataDocument={layout.resolvedDataDoc as Doc}
                        PanelWidth={() => this.lookupPixels(layout)}
                        PanelHeight={() => PanelHeight() - (BoolCast(Document.showWidthLabels) ? 20 : 0)}
                        getTransform={() => this.lookupIndividualTransform(layout)}
                    />
                    <WidthLabel
                        layout={layout}
                        collectionDoc={Document}
                    />
                </div>,
                <ResizeBar
                    width={resizerWidth}
                    key={Utils.GenerateGuid()}
                    columnUnitLength={this.getColumnUnitLength}
                    toLeft={layout}
                    toRight={childLayoutPairs[i + 1]?.layout}
                />
            );
        }
        collector.pop(); // removes the final extraneous resize bar
        return collector;
    }

    render(): JSX.Element {
        return (
            <div
                className={"collectionMulticolumnView_contents"}
                ref={this.createDropTarget}
            >
                {this.contents}
            </div>
        );
    }

}

interface ResizerProps {
    width: number;
    columnUnitLength(): number | undefined;
    toLeft?: Doc;
    toRight?: Doc;
}

enum ResizeMode {
    Global,
    Pinned,
    Undefined
}

@observer
class ResizeBar extends React.Component<ResizerProps> {
    @observable private isHoverActive = false;
    @observable private isResizingActive = false;
    private resizeMode = ResizeMode.Undefined;

    private registerResizing = (e: React.PointerEvent<HTMLDivElement>, mode: ResizeMode) => {
        e.stopPropagation();
        e.preventDefault();
        this.resizeMode = mode;
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
        this.isResizingActive = true;
    }

    private onPointerMove = ({ movementX }: PointerEvent) => {
        const { toLeft, toRight, columnUnitLength } = this.props;
        const movingRight = movementX > 0;
        const toNarrow = movingRight ? toRight : toLeft;
        const toWiden = movingRight ? toLeft : toRight;
        const unitLength = columnUnitLength();
        if (unitLength) {
            if (toNarrow) {
                const { widthUnit, widthMagnitude } = toNarrow;
                const scale = widthUnit === "*" ? unitLength : 1;
                toNarrow.widthMagnitude = NumCast(widthMagnitude) - Math.abs(movementX) / scale;
            }
            if (this.resizeMode === ResizeMode.Pinned && toWiden) {
                const { widthUnit, widthMagnitude } = toWiden;
                const scale = widthUnit === "*" ? unitLength : 1;
                toWiden.widthMagnitude = NumCast(widthMagnitude) + Math.abs(movementX) / scale;
            }
        }
    }

    private get isActivated() {
        const { toLeft, toRight } = this.props;
        if (toLeft && toRight) {
            if (StrCast(toLeft.widthUnit) === "px" && StrCast(toRight.widthUnit) === "px") {
                return false;
            }
            return true;
        } else if (toLeft) {
            if (StrCast(toLeft.widthUnit) === "px") {
                return false;
            }
            return true;
        } else if (toRight) {
            if (StrCast(toRight.widthUnit) === "px") {
                return false;
            }
            return true;
        }
        return false;
    }

    @action
    private onPointerUp = () => {
        this.resizeMode = ResizeMode.Undefined;
        this.isResizingActive = false;
        this.isHoverActive = false;
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
    }

    render() {
        return (
            <div
                className={"resizer"}
                style={{
                    width: this.props.width,
                    opacity: this.isActivated && this.isHoverActive ? resizerOpacity : 0
                }}
                onPointerEnter={action(() => this.isHoverActive = true)}
                onPointerLeave={action(() => !this.isResizingActive && (this.isHoverActive = false))}
            >
                <div
                    className={"internal"}
                    onPointerDown={e => this.registerResizing(e, ResizeMode.Pinned)}
                />
                <div
                    className={"internal"}
                    onPointerDown={e => this.registerResizing(e, ResizeMode.Global)}
                />
            </div>
        );
    }

}

interface WidthLabelProps {
    layout: Doc;
    collectionDoc: Doc;
    decimals?: number;
}

@observer
class WidthLabel extends React.Component<WidthLabelProps> {

    @computed
    private get contents() {
        const { layout, decimals } = this.props;
        const magnitude = NumCast(layout.widthMagnitude).toFixed(decimals ?? 3);
        const unit = StrCast(layout.widthUnit);
        return <span className={"display"}>{magnitude} {unit}</span>;
    }

    render() {
        return BoolCast(this.props.collectionDoc.showWidthLabels) ? this.contents : (null);
    }

}