import { observer } from 'mobx-react';
import { makeInterface } from '../../new_fields/Schema';
import { documentSchema } from '../../new_fields/documentSchemas';
import { CollectionSubView } from './collections/CollectionSubView';
import { DragManager } from '../util/DragManager';
import * as React from "react";
import { Doc, DocListCast } from '../../new_fields/Doc';
import { NumCast, StrCast } from '../../new_fields/Types';
import { List } from '../../new_fields/List';
import { ContentFittingDocumentView } from './nodes/ContentFittingDocumentView';
import { Utils } from '../../Utils';
import "./collectionMulticolumnView.scss";
import { computed } from 'mobx';

type MulticolumnDocument = makeInterface<[typeof documentSchema]>;
const MulticolumnDocument = makeInterface(documentSchema);

interface Unresolved {
    config: Doc;
    target: Doc;
    magnitude: number;
    unit: string;
}

interface Resolved {
    config: Doc;
    target: Doc;
    pixels: number;
}

interface LayoutData {
    unresolved: Unresolved[];
    numFixed: number;
    numRatio: number;
    starSum: number;
}

const resolvedUnits = ["*", "px"];
const resizerWidth = 2;

@observer
export default class CollectionMulticolumnView extends CollectionSubView(MulticolumnDocument) {
    private _dropDisposer?: DragManager.DragDropDisposer;

    /**
     * Returns the list of so-called configuration documents.
     * Each one is a wrapper around what we typically think of as
     * the child document, just also encoding the magnitude and unit
     * of the specified width.
     */
    private get configuration() {
        const { Document } = this.props;
        if (!Document.multicolumnData) {
            Document.multicolumnData = new List<Doc>();
        }
        return DocListCast(this.Document.multicolumnData);
    }

    @computed
    private get resolvedLayoutInformation(): LayoutData {
        const unresolved: Unresolved[] = [];
        let starSum = 0, numFixed = 0, numRatio = 0;
        for (const config of this.configuration) {
            const { target, widthMagnitude, widthUnit } = config;
            if (target instanceof Doc) {
                const unit = StrCast(widthUnit);
                const magnitude = NumCast(widthMagnitude);
                if (unit && magnitude && magnitude > 0 && resolvedUnits.includes(unit)) {
                    if (unit === "*") {
                        starSum += magnitude;
                        numRatio++;
                    } else {
                        numFixed++;
                    }
                    unresolved.push({ config, target, magnitude, unit });
                }
                // otherwise, the particular configuration entry is ignored and the remaining
                // space is allocated as if the document were absent from the configuration list
            }
        }
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
        const layout = this.resolvedLayoutInformation;
        if (!layout) {
            return undefined;
        }
        let sum = 0;
        for (const { magnitude, unit } of layout.unresolved) {
            if (unit === "px") {
                sum += magnitude;
            }
        }
        return sum;
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
        const { totalFixedAllocation } = this;
        const layout = this.resolvedLayoutInformation;
        if (!layout) {
            return undefined;
        }
        return totalFixedAllocation !== undefined ? this.props.PanelWidth() - (totalFixedAllocation + resizerWidth * (layout.unresolved.length - 1)) : undefined;
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
        const layout = this.resolvedLayoutInformation;
        const { totalRatioAllocation } = this;
        if (layout === null || totalRatioAllocation === undefined) {
            return undefined;
        }
        return totalRatioAllocation / layout.starSum;
    }

    @computed
    private get contents(): JSX.Element[] | null {
        const layout = this.resolvedLayoutInformation;
        const columnUnitLength = this.columnUnitLength;
        if (layout === null || columnUnitLength === undefined) {
            return (null); // we're still waiting on promises to resolve
        }
        const resolved: Resolved[] = [];
        layout.unresolved.forEach(item => {
            const { unit, magnitude, ...remaining } = item;
            let width = magnitude;
            if (unit === "*") {
                width = magnitude * columnUnitLength;
            }
            resolved.push({ pixels: width, ...remaining });
        });
        const collector: JSX.Element[] = [];
        for (let i = 0; i < resolved.length; i++) {
            const { target, pixels, config } = resolved[i];
            collector.push(
                <div className={"fish"}>
                    <ContentFittingDocumentView
                        {...this.props}
                        key={Utils.GenerateGuid()}
                        Document={target}
                        DataDocument={undefined}
                        PanelWidth={() => pixels}
                        getTransform={this.props.ScreenToLocalTransform}
                    />
                    <span className={"display"}>{NumCast(config.widthMagnitude).toFixed(3)} {StrCast(config.widthUnit)}</span>
                </div>,
                <ResizeBar
                    width={resizerWidth}
                    key={Utils.GenerateGuid()}
                    columnUnitLength={columnUnitLength}
                    toLeft={config}
                    toRight={resolved[i + 1]?.config}
                />
            );
        }
        collector.pop(); // removes the final extraneous resize bar
        return collector;
    }

    render(): JSX.Element {
        return (
            <div className={"collectionMulticolumnView_contents"}>
                {this.contents}
            </div>
        );
    }

}

interface SpacerProps {
    width: number;
    columnUnitLength: number;
    toLeft?: Doc;
    toRight?: Doc;
}

class ResizeBar extends React.Component<SpacerProps> {

    private registerResizing = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
    }

    private onPointerMove = ({ movementX }: PointerEvent) => {
        const { toLeft, toRight, columnUnitLength } = this.props;
        const target = movementX > 0 ? toRight : toLeft;
        if (target) {
            const { widthUnit, widthMagnitude } = target;
            if (widthUnit === "*") {
                target.widthMagnitude = NumCast(widthMagnitude) - Math.abs(movementX) / columnUnitLength;
            }
        }
    }

    private onPointerUp = () => {
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
    }

    render() {
        return (
            <div
                className={"spacer"}
                style={{ width: this.props.width }}
                onPointerDown={this.registerResizing}
            />
        );
    }

}