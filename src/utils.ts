export function random(len: number) {
    let option = "sdsdfgfhhjkj21323456778zxcvbv";
    let length = option.length;
    let ans = "";
    for(let i = 0; i < len ; i++) {
        ans += option[Math.floor((Math.random() * length))] // 0 => 20
    }
    return ans;
}