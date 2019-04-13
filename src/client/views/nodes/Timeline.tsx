import * as React from "react"
import * as ReactDOM from "react-dom"
import { observer } from "mobx-react"
import { observable, reaction } from "mobx"
import { TimelineField } from "../../../fields/TimelineField";
import "./Timeline.scss"
import { KeyStore } from "../../../fields/KeyStore";
import { Document } from "../../../fields/Document";

@observer
export class Timeline extends React.Component<TimelineField>{

    private _isRecording = false;
    onRecord = (e: React.MouseEvent) => {
        this._isRecording = true;
    }

    onStop = (e: React.MouseEvent) => {
        this._isRecording = false;
    }

    componentDidMount() {
        let doc: Document;
        let keyFrame: Document;
        let keys = [KeyStore.X, KeyStore.Y];
        reaction(() => {
            return keys.map(key => doc.GetNumber(key, 0));
        }, data => {
            keys.forEach((key, index) => {
                keyFrame.SetNumber(key, data[index]);
            });
        });
    }

    render() {
        return (
            <div>
                <div className="timeline-container">
                    <div className="timeline">
                        <div className="inner">
                        </div>
                    </div>
                    <button>Record</button>
                    <button> Stop </button>
                    <input placeholder="Time"></input>
                </div>
            </div>
        )
    }
}