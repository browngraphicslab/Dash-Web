import { observable, computed } from "mobx";
import React = require("react");
import { DocumentView } from "./views/nodes/DocumentView";
import { SelectionManager } from "./util/SelectionManager";
import { observer } from "mobx-react";
import './DocumentDecorations.scss'

@observer
export class DocumentDecorations extends React.Component {
    @computed
    get x(): number {
        let left = Number.MAX_VALUE;
        SelectionManager.SelectedDocuments().forEach(element => {
            if (element.mainCont.current !== null) {
                left = Math.min(element.mainCont.current.getBoundingClientRect().left, left)
            }
        });
        return left;
    }

    @computed
    get y(): number {
        let top = Number.MAX_VALUE;
        SelectionManager.SelectedDocuments().forEach(element => {
            if (element.mainCont.current !== null) {
                top = Math.min(element.mainCont.current.getBoundingClientRect().top, top)
            }
        });
        return top;
    }

    @computed
    get height(): number {
        return (SelectionManager.SelectedDocuments().reduce((bottom, element) => {
            if (element.mainCont.current !== null) {
                return Math.max(element.mainCont.current.getBoundingClientRect().bottom, bottom)
            }
            else {
                return bottom
            }
        }, Number.MIN_VALUE)) - this.y;
    }

    @computed
    get width(): number {
        let right = Number.MIN_VALUE;
        SelectionManager.SelectedDocuments().forEach(element => {
            if (element.mainCont.current !== null) {
                right = Math.max(element.mainCont.current.getBoundingClientRect().right, right)
            }
        });
        return right - this.x;
    }

    render() {
        return(
            <div className="documentDecorations-container" style={{
                width: `${this.width + 40}px`,
                height: `${this.height + 40}px`,
                left: this.x - 20,
                top: this.y - 20
            }}>
                <div id="documentDecorations-topLeftResizer" className="documentDecorations-resizer"></div>
                <div id="documentDecorations-topResizer" className="documentDecorations-resizer"></div>
                <div id="documentDecorations-topRightResizer" className="documentDecorations-resizer"></div>
                <div id="documentDecorations-leftResizer" className="documentDecorations-resizer"></div>
                <div id="documentDecorations-centerCont"></div>
                <div id="documentDecorations-rightResizer" className="documentDecorations-resizer"></div>
                <div id="documentDecorations-bottomLeftResizer" className="documentDecorations-resizer"></div>
                <div id="documentDecorations-bottomResizer" className="documentDecorations-resizer"></div>
                <div id="documentDecorations-bottomRightResizer" className="documentDecorations-resizer"></div>

            </div>
        )
    }
}