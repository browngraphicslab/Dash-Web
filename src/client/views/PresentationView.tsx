import React = require("react");
import { observable } from "mobx";
import { observer } from "mobx-react";
import "./ContextMenu.scss"
import { CollectionFreeFormDocumentView } from "./nodes/CollectionFreeFormDocumentView";

@observer
export class PresentationView extends React.Component {
    static Instance: PresentationView

    @observable private _pageX: number = 0;
    @observable private _pageY: number = 0;
    @observable private _display: string = "none";

    private ref: React.RefObject<HTMLDivElement>;

    constructor(props: Readonly<{}>) {
        super(props);

        this.ref = React.createRef()

        PresentationView.Instance = this;
    }


    displayMenu(x: number, y: number) {
        this._pageX = x
        this._pageY = y

        this._display = "flex"
    }

    intersects = (x: number, y: number): boolean => {
        if (this.ref.current && this._display !== "none") {
            if (x >= this._pageX && x <= this._pageX + this.ref.current.getBoundingClientRect().width) {
                if (y >= this._pageY && y <= this._pageY + this.ref.current.getBoundingClientRect().height) {
                    return true;
                }
            }
        }
        return false;
    }

    render() {
        return (
            <div className="presView" style={{ left: this._pageX, top: this._pageY, display: this._display }} ref={this.ref}>
                {this._items.map(prop => {
                    return <CollectionFreeFormDocumentView {...prop} key={prop.description} />
                })}
            </div>
        )
    }
}