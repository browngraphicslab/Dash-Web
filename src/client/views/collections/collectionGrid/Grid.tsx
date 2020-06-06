import * as React from 'react';
import { observer } from "mobx-react";


import "../../../../../node_modules/react-grid-layout/css/styles.css";
import "../../../../../node_modules/react-resizable/css/styles.css";

import * as GridLayout from 'react-grid-layout';
import { Layout } from 'react-grid-layout';
export { Layout } from 'react-grid-layout';


interface GridProps {
    width: number;
    nodeList: JSX.Element[] | null;
    layout: Layout[] | undefined;
    numCols: number;
    rowHeight: number;
    setLayout: Function;
    transformScale: number;
    childrenDraggable: boolean;
    // deletePlaceholder: Function;
    preventCollision: boolean;
    compactType: string;
}

/**
 * Wrapper around the actual GridLayout of `react-grid-layout`.
 */
@observer
export default class Grid extends React.Component<GridProps> {

    // private dragging: boolean = false;

    constructor(props: Readonly<GridProps>) {
        super(props);
        this.onLayoutChange = this.onLayoutChange.bind(this);
        // this.onDrag = this.onDrag.bind(this);
    }
    /**
     * If there has been a change in layout, calls a method in CollectionGridView to set the layouts on the Document.
     * @param layout `Layout[]`
     */
    onLayoutChange(layout: Layout[]) {
        this.props.setLayout(layout);
    }

    // onDrag(layout: Layout[],
    //     oldItem: Layout,
    //     newItem: Layout,
    //     placeholder: Layout,
    //     event: MouseEvent,
    //     element: HTMLElement) {
    //     this.props.deletePlaceholder(placeholder, event);
    //     console.log("Grid -> event", event.clientX)

    // }

    render() {
        console.log(this.props.transformScale);

        const compactType = this.props.compactType === "vertical" || this.props.compactType === "horizontal" ? this.props.compactType : null;

        return (
            <GridLayout className="layout"
                layout={this.props.layout}
                cols={this.props.numCols}
                rowHeight={this.props.rowHeight}
                width={this.props.width}
                compactType={compactType}
                isDroppable={true}
                isDraggable={this.props.childrenDraggable}
                isResizable={this.props.childrenDraggable}
                useCSSTransforms={true}
                onLayoutChange={this.onLayoutChange}
                preventCollision={this.props.preventCollision}
                transformScale={this.props.transformScale} // still doesn't work :(
                style={{ zIndex: 5 }}
            >
                {this.props.nodeList}
            </GridLayout >
        );
    }
}
