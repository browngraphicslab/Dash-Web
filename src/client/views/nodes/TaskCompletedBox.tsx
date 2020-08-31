import React = require("react");
import { observer } from "mobx-react";
import "./TaskCompletedBox.scss";
import { observable, action } from "mobx";
import { Fade } from "@material-ui/core";


@observer
export class TaskCompletionBox extends React.Component<{}> {

    @observable public static taskCompleted: boolean = false;
    @observable public static popupX: number = 500;
    @observable public static popupY: number = 150;
    @observable public static textDisplayed: string;

    @action
    public static toggleTaskCompleted = () => {
        TaskCompletionBox.taskCompleted = !TaskCompletionBox.taskCompleted;
    }

    render() {
        return <Fade in={TaskCompletionBox.taskCompleted}>
            <div className="taskCompletedBox-fade"
                style={{
                    left: TaskCompletionBox.popupX ? TaskCompletionBox.popupX : 500,
                    top: TaskCompletionBox.popupY ? TaskCompletionBox.popupY : 150,
                }}>{TaskCompletionBox.textDisplayed}</div>
        </Fade>;
    }
} 