import Denque from "../utils/denque";

export class MessageManager {
    private _buffer : Denque = new Denque();
    private _unreceived : any[] = [];

    public write: (msg : any, transferableObjects? : any[]) => void = (msg, transferableObjects) => {

	};

    public queue (msg : any) {
        this._buffer.push(msg);
    }

    public length () : number{
        return this._buffer.length;
    }

    public read (callback : (msg : any) => boolean) {
        let msg, ret, total = 0;

        msg = this._buffer.shift();

        while (msg){
            ret = callback(msg);
            if(!ret){
                this._unreceived.push(msg);
            }else{
                total += 1;
            }

            msg = this._buffer.shift()
        }

        //swap the arrays to prevent allocations
        //I have no idea why he does this
        const oldBuffer = this._buffer.toArray();
        this._buffer._fromArray(this._unreceived);
        this._unreceived = oldBuffer;

        return total;
    }
}