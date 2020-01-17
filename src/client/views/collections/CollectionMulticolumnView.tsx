import { observer } from 'mobx-react';
import { makeInterface } from '../../../new_fields/Schema';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { CollectionSubView } from './CollectionSubView';
import * as React from "react";
import { Doc } from '../../../new_fields/Doc';
import { NumCast, StrCast } from '../../../new_fields/Types';
import { ContentFittingDocumentView } from './../nodes/ContentFittingDocumentView';
import { Utils } from '../../../Utils';
import "./collectionMulticolumnView.scss";
import { computed } from 'mobx';

type MulticolumnDocument = makeInterface<[typeof documentSchema]>;
const MulticolumnDocument = makeInterface(documentSchema);

interface Unresolved {
    target: Doc;
    magnitude: number;
    unit: string;
}

interface Resolved {
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
export class CollectionMulticolumnView extends CollectionSubView(MulticolumnDocument) {
    @computed
    private get resolvedLayoutInformation(): LayoutData {
        const unresolved: Unresolved[] = [];
        let starSum = 0, numFixed = 0, numRatio = 0;
        for (const pair of this.childLayoutPairs) {
            const unit = StrCast(pair.layout.widthUnit);
            const magnitude = NumCast(pair.layout.widthMagnitude);
            if (unit && magnitude && magnitude > 0 && resolvedUnits.includes(unit)) {
                if (unit === "*") {
                    starSum += magnitude;
                    numRatio++;
                } else {
                    numFixed++;
                }
                unresolved.push({ target: pair.layout, magnitude, unit });
            }
            // otherwise, the particular configuration entry is ignored and the remaining
            // space is allocated as if the document were absent from the configuration list
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
        if (layoutInfoLen > 0 && this.totalFixedAllocation !== undefined)
            return this.props.PanelWidth() - (this.totalFixedAllocation + resizerWidth * (layoutInfoLen - 1));
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
        let offset = 0;
        for (let i = 0; i < resolved.length; i++) {
            const { target, pixels } = resolved[i];
            const shiftX = offset;
            collector.push(
                <div className={"fish"}>
                    <ContentFittingDocumentView
                        {...this.props}
                        key={Utils.GenerateGuid()}
                        Document={target}
                        DataDocument={target.resolvedDataDoc as Doc}
                        PanelWidth={() => pixels}
                        getTransform={() => this.props.ScreenToLocalTransform().translate(-shiftX, 0)}
                    />
                    <span className={"display"}>{NumCast(target.widthMagnitude).toFixed(3)} {StrCast(target.widthUnit)}</span>
                </div>,
                <ResizeBar
                    width={resizerWidth}
                    key={Utils.GenerateGuid()}
                    columnUnitLength={columnUnitLength}
                    toLeft={target}
                    toRight={resolved[i + 1]?.target}
                />
            );
            offset += pixels + resizerWidth;
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

    private get opacity() {
        const { toLeft, toRight } = this.props;
        if (toLeft && toRight) {
            if (StrCast(toLeft.widthUnit) === "px" && StrCast(toRight.widthUnit) === "px") {
                return 0;
            }
            return 0.4;
        } else if (toLeft) {
            if (StrCast(toLeft.widthUnit) === "px") {
                return 0;
            }
            return 0.4;
        } else if (toRight) {
            if (StrCast(toRight.widthUnit) === "px") {
                return 0;
            }
            return 0.4;
        }
        return 0;
    }

    private onPointerUp = () => {
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
    }

    render() {
        return (
            <div
                className={"resizer"}
                style={{
                    width: this.props.width,
                    opacity: this.opacity
                }}
                onPointerDown={this.registerResizing}
            />
        );
    }

}