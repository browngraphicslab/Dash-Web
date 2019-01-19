import { observable, computed } from "mobx";
import React = require("react");
import { DocumentView } from "./views/nodes/DocumentView";
import { SelectionManager } from "./util/SelectionManager";

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
        let bottom = Number.MIN_VALUE;
        SelectionManager.SelectedDocuments().forEach(element => {
            if (element.mainCont.current !== null) {
                bottom = Math.min(element.mainCont.current.getBoundingClientRect().bottom, bottom)
            }
        });
        return bottom - this.y;
    }

    @computed
    get width(): number {
        let right = Number.MIN_VALUE;
        console.log(SelectionManager.SelectedDocuments())
        SelectionManager.SelectedDocuments().forEach(element => {
            if (element.mainCont.current !== null) {
                right = Math.min(element.mainCont.current.getBoundingClientRect().right, right)
            }
        });
        return right - this.x;
    }

    render() {
        return(
            <div className="documentDecorations-container" style={{
                width: `${this.width}px`,
                height: `${this.height}px`,
                left: this.x,
                top: this.y
            }}>

            </div>
        )
    }
}