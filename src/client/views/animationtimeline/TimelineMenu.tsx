
import * as React from "react";


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
export class TimelineMenu extends React.Component {
    public static Instance:TimelineMenu; 

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