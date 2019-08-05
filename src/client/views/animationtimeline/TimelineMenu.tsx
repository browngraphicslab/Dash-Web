import * as React from "react";
import {observable, action, runInAction} from "mobx"; 
import {observer} from "mobx-react"; 

/**
 * TimelineMenu: 
 * 
 * 
 * Timeline: 
 *  - 
 * 
 * 
 * Keyframe: 
 *  - Delete keyframe
 *  - Move keyframe
 *  - Edit keyframe (shows schema)
 * 
 * 
 * Region: 
 *  - Add Keyframe 
 *  - Copy Interpolation 
 *  - Copy path
 *  - Add Interpolation 
 *  - Add Path 
 *  - Change fades
 *  - position region 
 *  - duration region 
 *  - 
 */

@observer
export class TimelineMenu extends React.Component {
    public static Instance:TimelineMenu; 

    @observable private _opacity = 1; 
    @observable private _x = 0; 
    @observable private _y = 0; 
    @observable private _type: "timeline" | "keyframe" | "region" | "" = ""; 


    constructor (props:Readonly<{}>){
        super(props); 
        TimelineMenu.Instance = this; 
    }




    render() {
        return (
            <div></div>
        );
    }

}